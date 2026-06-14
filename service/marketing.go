package service

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
	"gorm.io/gorm"
)

type RedemptionCodeGenerateRequest struct {
	Type           model.RedemptionCodeType `json:"type"`
	Credits        int                      `json:"credits"`
	SubscriptionID string                   `json:"subscriptionId"`
	Count          int                      `json:"count"`
}

func MarketingSettings() (model.PublicMarketingSetting, error) {
	settings, err := repository.GetSettings()
	return normalizeSettings(settings).Public.Marketing, err
}

func SaveMarketingSettings(marketing model.PublicMarketingSetting) (model.PublicMarketingSetting, error) {
	settings, err := repository.GetSettings()
	if err != nil {
		return model.PublicMarketingSetting{}, err
	}
	settings = normalizeSettings(settings)
	if marketing.RegisterCredits < 0 {
		marketing.RegisterCredits = 0
	}
	if marketing.DailyCredits < 0 {
		marketing.DailyCredits = 0
	}
	settings.Public.Marketing = marketing
	if _, err := repository.SaveSettings(settings, now()); err != nil {
		return model.PublicMarketingSetting{}, err
	}
	return marketing, nil
}

func ListSubscriptionPlans(q model.Query) (model.SubscriptionPlanList, error) {
	items, total, err := repository.ListSubscriptionPlans(q)
	if err != nil {
		return model.SubscriptionPlanList{}, err
	}
	return model.SubscriptionPlanList{Items: items, Total: int(total)}, nil
}

func SaveSubscriptionPlan(plan model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	plan.Name = strings.TrimSpace(plan.Name)
	if plan.Name == "" {
		return plan, safeMessageError{message: "请输入订阅名称"}
	}
	if plan.DurationDays <= 0 {
		return plan, safeMessageError{message: "订阅天数必须大于 0"}
	}
	if plan.ID == "" {
		plan.ID = newID("sub")
		plan.CreatedAt = now()
	} else if saved, ok, err := repository.GetSubscriptionPlanByID(plan.ID); err != nil {
		return plan, err
	} else if ok {
		plan.CreatedAt = saved.CreatedAt
	}
	plan.UpdatedAt = now()
	return repository.SaveSubscriptionPlan(plan)
}

func DeleteSubscriptionPlan(id string) error {
	return repository.DeleteSubscriptionPlan(id)
}

func ListRedemptionCodes(q model.Query) (model.RedemptionCodeList, error) {
	items, total, err := repository.ListRedemptionCodes(q)
	if err != nil {
		return model.RedemptionCodeList{}, err
	}
	return model.RedemptionCodeList{Items: items, Total: int(total)}, nil
}

func GenerateRedemptionCodes(request RedemptionCodeGenerateRequest) ([]model.RedemptionCode, error) {
	if request.Count <= 0 {
		return nil, safeMessageError{message: "生成数量必须大于 0"}
	}
	if request.Count > 500 {
		return nil, safeMessageError{message: "单次最多生成 500 个兑换码"}
	}
	item := model.RedemptionCode{Type: request.Type}
	if request.Type == model.RedemptionCodeTypeCredits {
		if request.Credits <= 0 {
			return nil, safeMessageError{message: "点数数量必须大于 0"}
		}
		item.Credits = request.Credits
	} else if request.Type == model.RedemptionCodeTypeSubscription {
		plan, ok, err := repository.GetSubscriptionPlanByID(request.SubscriptionID)
		if err != nil {
			return nil, err
		}
		if !ok || !plan.Enabled {
			return nil, safeMessageError{message: "请选择可用订阅"}
		}
		item.SubscriptionID = plan.ID
		item.SubscriptionName = plan.Name
		item.SubscriptionDurationDays = plan.DurationDays
	} else {
		return nil, safeMessageError{message: "兑换码类型无效"}
	}

	batchID := newID("redeem-batch")
	createdAt := now()
	items := make([]model.RedemptionCode, 0, request.Count)
	seenCodes := map[string]bool{}
	for len(items) < request.Count {
		code, err := newRedemptionCode()
		if err != nil {
			return nil, err
		}
		if seenCodes[code] {
			continue
		}
		seenCodes[code] = true
		items = append(items, model.RedemptionCode{
			ID:                       newID("redeem"),
			Code:                     code,
			BatchID:                  batchID,
			Type:                     item.Type,
			Credits:                  item.Credits,
			SubscriptionID:           item.SubscriptionID,
			SubscriptionName:         item.SubscriptionName,
			SubscriptionDurationDays: item.SubscriptionDurationDays,
			CreatedAt:                createdAt,
			UpdatedAt:                createdAt,
		})
	}
	return repository.SaveRedemptionCodes(items)
}

func MarketingStatus(userID string) (model.MarketingStatus, error) {
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok {
		if err != nil {
			return model.MarketingStatus{}, err
		}
		return model.MarketingStatus{}, safeMessageError{message: "用户不存在"}
	}
	marketing, err := MarketingSettings()
	if err != nil {
		return model.MarketingStatus{}, err
	}
	dailyDate := today()
	claimed, err := repository.HasDailyRewardClaim(userID, dailyDate)
	if err != nil {
		return model.MarketingStatus{}, err
	}
	return model.MarketingStatus{
		User:                  model.PublicUser(user),
		Marketing:             marketing,
		DailyDate:             dailyDate,
		DailyClaimed:          claimed,
		SubscriptionID:        user.SubscriptionID,
		SubscriptionName:      user.SubscriptionName,
		SubscriptionExpireAt:  user.SubscriptionExpireAt,
	}, nil
}

func ClaimDailyCredits(userID string) (model.MarketingStatus, error) {
	marketing, err := MarketingSettings()
	if err != nil {
		return model.MarketingStatus{}, err
	}
	if marketing.DailyCredits <= 0 {
		return model.MarketingStatus{}, safeMessageError{message: "每日领取未开启"}
	}
	dailyDate := today()
	user, ok, err := repository.ClaimDailyReward(userID, dailyDate, marketing.DailyCredits, now())
	if err != nil {
		return model.MarketingStatus{}, err
	}
	if !ok {
		return model.MarketingStatus{}, safeMessageError{message: "今日已领取"}
	}
	return model.MarketingStatus{
		User:                 model.PublicUser(user),
		Marketing:            marketing,
		DailyDate:            dailyDate,
		DailyClaimed:         true,
		SubscriptionID:       user.SubscriptionID,
		SubscriptionName:     user.SubscriptionName,
		SubscriptionExpireAt: user.SubscriptionExpireAt,
	}, nil
}

func RedeemMarketingCode(userID string, code string) (model.MarketingRedeemResult, error) {
	user, ok, err := repository.GetUserByID(userID)
	if err != nil || !ok {
		if err != nil {
			return model.MarketingRedeemResult{}, err
		}
		return model.MarketingRedeemResult{}, safeMessageError{message: "用户不存在"}
	}
	nowText := now()
	redeemed, err := repository.RedeemCode(code, userID, nowText, func(tx *gorm.DB, item model.RedemptionCode) error {
		if item.Type == model.RedemptionCodeTypeCredits {
			if item.Credits <= 0 {
				return safeMessageError{message: "兑换码点数无效"}
			}
			if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{
				"credits":    gorm.Expr("credits + ?", item.Credits),
				"updated_at": nowText,
			}).Error; err != nil {
				return err
			}
			updated := model.User{}
			if err := tx.Where("id = ?", userID).First(&updated).Error; err != nil {
				return err
			}
			return tx.Create(&model.CreditLog{
				ID:        newID("credit"),
				UserID:    userID,
				Type:      model.CreditLogTypeRedeemCode,
				Amount:    item.Credits,
				Balance:   updated.Credits,
				RelatedID: item.Code,
				Remark:    "兑换码兑换点数",
				Extra:     redemptionExtra(item),
				CreatedAt: nowText,
			}).Error
		}
		if item.Type == model.RedemptionCodeTypeSubscription {
			expireAt, err := nextSubscriptionExpireAt(user.SubscriptionExpireAt, item.SubscriptionDurationDays)
			if err != nil {
				return err
			}
			if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{
				"subscription_id":        item.SubscriptionID,
				"subscription_name":      item.SubscriptionName,
				"subscription_expire_at": expireAt,
				"updated_at":             nowText,
			}).Error; err != nil {
				return err
			}
			return tx.Create(&model.CreditLog{
				ID:        newID("credit"),
				UserID:    userID,
				Type:      model.CreditLogTypeRedeemCode,
				Amount:    0,
				Balance:   user.Credits,
				RelatedID: item.Code,
				Remark:    "兑换码兑换订阅",
				Extra:     redemptionExtra(item),
				CreatedAt: nowText,
			}).Error
		}
		return safeMessageError{message: "兑换码类型无效"}
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.MarketingRedeemResult{}, safeMessageError{message: "兑换码不存在"}
		}
		if repository.IsRedemptionCodeUsedError(err) {
			return model.MarketingRedeemResult{}, safeMessageError{message: "兑换码已使用"}
		}
		return model.MarketingRedeemResult{}, err
	}
	user, _, err = repository.GetUserByID(userID)
	if err != nil {
		return model.MarketingRedeemResult{}, err
	}
	message := "兑换成功"
	if redeemed.Type == model.RedemptionCodeTypeCredits {
		message = "已兑换点数"
	} else if redeemed.Type == model.RedemptionCodeTypeSubscription {
		message = "已兑换订阅"
	}
	return model.MarketingRedeemResult{User: model.PublicUser(user), RedemptionCode: redeemed, Message: message}, nil
}

func nextSubscriptionExpireAt(current string, durationDays int) (string, error) {
	if durationDays <= 0 {
		return "", safeMessageError{message: "订阅天数无效"}
	}
	base := time.Now()
	if strings.TrimSpace(current) != "" {
		if parsed, err := time.Parse(time.RFC3339, current); err == nil && parsed.After(base) {
			base = parsed
		}
	}
	return base.AddDate(0, 0, durationDays).Format(time.RFC3339), nil
}

func today() string {
	return time.Now().Format("2006-01-02")
}

func newRedemptionCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	parts := make([]byte, 12)
	for i := range parts {
		index, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		parts[i] = alphabet[index.Int64()]
	}
	return string(parts[:4]) + "-" + string(parts[4:8]) + "-" + string(parts[8:]), nil
}

func redemptionExtra(item model.RedemptionCode) string {
	body, _ := json.Marshal(map[string]any{
		"code":                     item.Code,
		"type":                     item.Type,
		"subscriptionId":           item.SubscriptionID,
		"subscriptionName":         item.SubscriptionName,
		"subscriptionDurationDays": item.SubscriptionDurationDays,
	})
	return string(body)
}

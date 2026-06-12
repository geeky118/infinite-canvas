package repository

import (
	"errors"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func ListSubscriptionPlans(q model.Query) ([]model.SubscriptionPlan, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.SubscriptionPlan{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.SubscriptionPlan
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

func GetSubscriptionPlanByID(id string) (model.SubscriptionPlan, bool, error) {
	db, err := DB()
	if err != nil {
		return model.SubscriptionPlan{}, false, err
	}
	plan := model.SubscriptionPlan{}
	err = db.Where("id = ?", id).First(&plan).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.SubscriptionPlan{}, false, nil
	}
	return plan, err == nil, err
}

func SaveSubscriptionPlan(plan model.SubscriptionPlan) (model.SubscriptionPlan, error) {
	db, err := DB()
	if err != nil {
		return plan, err
	}
	return plan, db.Save(&plan).Error
}

func DeleteSubscriptionPlan(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.SubscriptionPlan{}, "id = ?", id).Error
}

func ListRedemptionCodes(q model.Query) ([]model.RedemptionCode, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.RedemptionCode{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("code LIKE ? OR batch_id LIKE ? OR used_by LIKE ? OR subscription_name LIKE ?", like, like, like, like)
	}
	if q.Type != "" {
		tx = tx.Where("type = ?", q.Type)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.RedemptionCode
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error
	return items, total, err
}

func SaveRedemptionCodes(items []model.RedemptionCode) ([]model.RedemptionCode, error) {
	db, err := DB()
	if err != nil {
		return items, err
	}
	if len(items) == 0 {
		return items, nil
	}
	return items, db.Create(&items).Error
}

func RedeemCode(code string, userID string, now string, apply func(tx *gorm.DB, item model.RedemptionCode) error) (model.RedemptionCode, error) {
	db, err := DB()
	if err != nil {
		return model.RedemptionCode{}, err
	}
	code = strings.ToUpper(strings.TrimSpace(code))
	var result model.RedemptionCode
	err = db.Transaction(func(tx *gorm.DB) error {
		item := model.RedemptionCode{}
		if err := tx.Where("code = ?", code).First(&item).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return gorm.ErrRecordNotFound
			}
			return err
		}
		if item.Used {
			return errRedemptionCodeUsed
		}
		update := tx.Model(&model.RedemptionCode{}).Where("id = ? AND used = ?", item.ID, false).Updates(map[string]any{
			"used":       true,
			"used_by":    userID,
			"used_at":    now,
			"updated_at": now,
		})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected == 0 {
			return errRedemptionCodeUsed
		}
		item.Used = true
		item.UsedBy = userID
		item.UsedAt = now
		item.UpdatedAt = now
		if err := apply(tx, item); err != nil {
			return err
		}
		result = item
		return nil
	})
	return result, err
}

var errRedemptionCodeUsed = errors.New("redemption code used")

func IsRedemptionCodeUsedError(err error) bool {
	return errors.Is(err, errRedemptionCodeUsed)
}

func HasDailyRewardClaim(userID string, date string) (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var total int64
	err = db.Model(&model.DailyRewardClaim{}).Where("user_id = ? AND date = ?", userID, date).Count(&total).Error
	return total > 0, err
}

func ClaimDailyReward(userID string, date string, credits int, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	var user model.User
	claimed := false
	err = db.Transaction(func(tx *gorm.DB) error {
		create := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.DailyRewardClaim{
			ID:        "daily-" + userID + "-" + date,
			UserID:    userID,
			Date:      date,
			Credits:   credits,
			CreatedAt: now,
		})
		if create.Error != nil {
			return create.Error
		}
		if create.RowsAffected == 0 {
			claimed = true
			return nil
		}
		if err := tx.Model(&model.User{}).Where("id = ?", userID).Updates(map[string]any{
			"credits":    gorm.Expr("credits + ?", credits),
			"updated_at": now,
		}).Error; err != nil {
			return err
		}
		if err := tx.Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		return tx.Create(&model.CreditLog{
			ID:        "credit-" + userID + "-" + date,
			UserID:    userID,
			Type:      model.CreditLogTypeDailyReward,
			Amount:    credits,
			Balance:   user.Credits,
			RelatedID: date,
			Remark:    "每日领取奖励",
			CreatedAt: now,
		}).Error
	})
	if err != nil {
		return model.User{}, false, err
	}
	if claimed {
		return model.User{}, false, nil
	}
	return user, true, nil
}

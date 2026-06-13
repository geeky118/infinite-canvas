package repository

import (
	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func AdminOverview() (model.AdminOverview, error) {
	db, err := DB()
	if err != nil {
		return model.AdminOverview{}, err
	}
	result := model.AdminOverview{}
	if err := countInto(db.Model(&model.User{}), &result.Users.Total); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.User{}).Where("status = ?", model.UserStatusActive), &result.Users.Active); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.User{}).Where("status = ?", model.UserStatusBan), &result.Users.Banned); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.User{}).Where("role = ?", model.UserRoleAdmin), &result.Users.Admins); err != nil {
		return result, err
	}
	if err := db.Model(&model.User{}).Select("COALESCE(SUM(credits), 0)").Scan(&result.Credits.BalanceTotal).Error; err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.CreditLog{}), &result.Credits.LogTotal); err != nil {
		return result, err
	}
	if err := db.Model(&model.CreditLog{}).Where("amount > 0").Select("COALESCE(SUM(amount), 0)").Scan(&result.Credits.IncomeTotal).Error; err != nil {
		return result, err
	}
	if err := db.Model(&model.CreditLog{}).Where("amount < 0").Select("COALESCE(SUM(amount), 0)").Scan(&result.Credits.ExpenseTotal).Error; err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.Prompt{}), &result.Content.Prompts); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.Asset{}), &result.Content.Assets); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.Asset{}).Where("type = ?", "image"), &result.Content.Images); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.Asset{}).Where("type = ?", "text"), &result.Content.Texts); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.SubscriptionPlan{}), &result.Marketing.SubscriptionPlans); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.SubscriptionPlan{}).Where("enabled = ?", true), &result.Marketing.EnabledSubscriptionPlans); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.RedemptionCode{}), &result.Marketing.RedemptionCodes); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.RedemptionCode{}).Where("used = ?", true), &result.Marketing.UsedCodes); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.RedemptionCode{}).Where("used = ?", false), &result.Marketing.UnusedCodes); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.RedemptionCode{}).Where("type = ?", model.RedemptionCodeTypeCredits), &result.Marketing.CreditCodes); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.RedemptionCode{}).Where("type = ?", model.RedemptionCodeTypeSubscription), &result.Marketing.SubscriptionCodes); err != nil {
		return result, err
	}
	if err := countInto(db.Model(&model.DailyRewardClaim{}), &result.Marketing.DailyClaims); err != nil {
		return result, err
	}
	if err := sumCreditLog(db, model.CreditLogTypeAdminAdjust, &result.Finance.AdminAdjustIncome); err != nil {
		return result, err
	}
	if err := sumCreditLog(db, model.CreditLogTypeRedeemCode, &result.Finance.RedeemIncome); err != nil {
		return result, err
	}
	if err := sumCreditLog(db, model.CreditLogTypeDailyReward, &result.Finance.DailyRewardIncome); err != nil {
		return result, err
	}
	if err := sumCreditLog(db, model.CreditLogTypeAIConsume, &result.Finance.AIExpense); err != nil {
		return result, err
	}
	if err := sumCreditLog(db, model.CreditLogTypeAIRefund, &result.Finance.AIRefund); err != nil {
		return result, err
	}
	return result, nil
}

func countInto(tx *gorm.DB, target *int64) error {
	return tx.Count(target).Error
}

func sumCreditLog(db *gorm.DB, logType model.CreditLogType, target *int64) error {
	return db.Model(&model.CreditLog{}).Where("type = ?", logType).Select("COALESCE(SUM(amount), 0)").Scan(target).Error
}

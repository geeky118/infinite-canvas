package repository

import (
	"sync"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func AdminOverview() (model.AdminOverview, error) {
	db, err := DB()
	if err != nil {
		return model.AdminOverview{}, err
	}
	result := model.AdminOverview{}
	var mu sync.Mutex
	var firstErr error
	setErr := func(err error) {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}

	var wg sync.WaitGroup
	wg.Add(5)

	// Group 1: Users
	go func() {
		defer wg.Done()
		r := model.AdminOverviewUsers{}
		if err := countInto(db.Model(&model.User{}), &r.Total); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.User{}).Where("status = ?", model.UserStatusActive), &r.Active); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.User{}).Where("status = ?", model.UserStatusBan), &r.Banned); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.User{}).Where("role = ?", model.UserRoleAdmin), &r.Admins); err != nil {
			setErr(err)
			return
		}
		mu.Lock()
		result.Users = r
		mu.Unlock()
	}()

	// Group 2: Credits
	go func() {
		defer wg.Done()
		r := model.AdminOverviewCredits{}
		if err := db.Model(&model.User{}).Select("COALESCE(SUM(credits), 0)").Scan(&r.BalanceTotal).Error; err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.CreditLog{}), &r.LogTotal); err != nil {
			setErr(err)
			return
		}
		if err := db.Model(&model.CreditLog{}).Where("amount > 0").Select("COALESCE(SUM(amount), 0)").Scan(&r.IncomeTotal).Error; err != nil {
			setErr(err)
			return
		}
		if err := db.Model(&model.CreditLog{}).Where("amount < 0").Select("COALESCE(SUM(amount), 0)").Scan(&r.ExpenseTotal).Error; err != nil {
			setErr(err)
			return
		}
		mu.Lock()
		result.Credits = r
		mu.Unlock()
	}()

	// Group 3: Content
	go func() {
		defer wg.Done()
		r := model.AdminOverviewContent{}
		if err := countInto(db.Model(&model.Prompt{}), &r.Prompts); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.Asset{}), &r.Assets); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.Asset{}).Where("type = ?", "image"), &r.Images); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.Asset{}).Where("type = ?", "text"), &r.Texts); err != nil {
			setErr(err)
			return
		}
		mu.Lock()
		result.Content = r
		mu.Unlock()
	}()

	// Group 4: Marketing
	go func() {
		defer wg.Done()
		r := model.AdminOverviewMarketing{}
		if err := countInto(db.Model(&model.SubscriptionPlan{}), &r.SubscriptionPlans); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.SubscriptionPlan{}).Where("enabled = ?", true), &r.EnabledSubscriptionPlans); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.RedemptionCode{}), &r.RedemptionCodes); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.RedemptionCode{}).Where("used = ?", true), &r.UsedCodes); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.RedemptionCode{}).Where("used = ?", false), &r.UnusedCodes); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.RedemptionCode{}).Where("type = ?", model.RedemptionCodeTypeCredits), &r.CreditCodes); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.RedemptionCode{}).Where("type = ?", model.RedemptionCodeTypeSubscription), &r.SubscriptionCodes); err != nil {
			setErr(err)
			return
		}
		if err := countInto(db.Model(&model.DailyRewardClaim{}), &r.DailyClaims); err != nil {
			setErr(err)
			return
		}
		mu.Lock()
		result.Marketing = r
		mu.Unlock()
	}()

	// Group 5: Finance
	go func() {
		defer wg.Done()
		r := model.AdminOverviewFinance{}
		if err := sumCreditLog(db, model.CreditLogTypeAdminAdjust, &r.AdminAdjustIncome); err != nil {
			setErr(err)
			return
		}
		if err := sumCreditLog(db, model.CreditLogTypeRedeemCode, &r.RedeemIncome); err != nil {
			setErr(err)
			return
		}
		if err := sumCreditLog(db, model.CreditLogTypeDailyReward, &r.DailyRewardIncome); err != nil {
			setErr(err)
			return
		}
		if err := sumCreditLog(db, model.CreditLogTypeAIConsume, &r.AIExpense); err != nil {
			setErr(err)
			return
		}
		if err := sumCreditLog(db, model.CreditLogTypeAIRefund, &r.AIRefund); err != nil {
			setErr(err)
			return
		}
		mu.Lock()
		result.Finance = r
		mu.Unlock()
	}()

	wg.Wait()
	return result, firstErr
}

func countInto(tx *gorm.DB, target *int64) error {
	return tx.Count(target).Error
}

func sumCreditLog(db *gorm.DB, logType model.CreditLogType, target *int64) error {
	return db.Model(&model.CreditLog{}).Where("type = ?", logType).Select("COALESCE(SUM(amount), 0)").Scan(target).Error
}

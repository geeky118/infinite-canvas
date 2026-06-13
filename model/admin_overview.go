package model

type AdminOverview struct {
	Users         AdminOverviewUsers     `json:"users"`
	Credits       AdminOverviewCredits   `json:"credits"`
	Content       AdminOverviewContent   `json:"content"`
	Marketing     AdminOverviewMarketing `json:"marketing"`
	Finance       AdminOverviewFinance   `json:"finance"`
	SystemModules AdminOverviewModules   `json:"systemModules"`
}

type AdminOverviewUsers struct {
	Total  int64 `json:"total"`
	Active int64 `json:"active"`
	Banned int64 `json:"banned"`
	Admins int64 `json:"admins"`
}

type AdminOverviewCredits struct {
	BalanceTotal int64 `json:"balanceTotal"`
	LogTotal     int64 `json:"logTotal"`
	IncomeTotal  int64 `json:"incomeTotal"`
	ExpenseTotal int64 `json:"expenseTotal"`
}

type AdminOverviewContent struct {
	Prompts int64 `json:"prompts"`
	Assets  int64 `json:"assets"`
	Images  int64 `json:"images"`
	Texts   int64 `json:"texts"`
}

type AdminOverviewMarketing struct {
	SubscriptionPlans        int64 `json:"subscriptionPlans"`
	EnabledSubscriptionPlans int64 `json:"enabledSubscriptionPlans"`
	RedemptionCodes          int64 `json:"redemptionCodes"`
	UnusedCodes              int64 `json:"unusedCodes"`
	UsedCodes                int64 `json:"usedCodes"`
	CreditCodes              int64 `json:"creditCodes"`
	SubscriptionCodes        int64 `json:"subscriptionCodes"`
	DailyClaims              int64 `json:"dailyClaims"`
}

type AdminOverviewFinance struct {
	AdminAdjustIncome int64 `json:"adminAdjustIncome"`
	RedeemIncome      int64 `json:"redeemIncome"`
	DailyRewardIncome int64 `json:"dailyRewardIncome"`
	AIExpense         int64 `json:"aiExpense"`
	AIRefund          int64 `json:"aiRefund"`
}

type AdminOverviewModules struct {
	Total       int      `json:"total"`
	Groups      int      `json:"groups"`
	Permissions []string `json:"permissions"`
}

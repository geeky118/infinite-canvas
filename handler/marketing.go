package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/service"
)

type redeemCodeRequest struct {
	Code string `json:"code"`
}

func AdminMarketingSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := service.MarketingSettings()
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, settings)
}

func AdminSaveMarketingSettings(w http.ResponseWriter, r *http.Request) {
	var settings model.PublicMarketingSetting
	_ = json.NewDecoder(r.Body).Decode(&settings)
	result, err := service.SaveMarketingSettings(settings)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListSubscriptionPlans(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminSaveSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	var plan model.SubscriptionPlan
	_ = json.NewDecoder(r.Body).Decode(&plan)
	result, err := service.SaveSubscriptionPlan(plan)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminDeleteSubscriptionPlan(w http.ResponseWriter, r *http.Request, id string) {
	if err := service.DeleteSubscriptionPlan(id); err != nil {
		FailError(w, err)
		return
	}
	OK(w, true)
}

func AdminRedemptionCodes(w http.ResponseWriter, r *http.Request) {
	result, err := service.ListRedemptionCodes(parseQuery(r))
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func AdminGenerateRedemptionCodes(w http.ResponseWriter, r *http.Request) {
	var request service.RedemptionCodeGenerateRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.GenerateRedemptionCodes(request)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func MarketingStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.MarketingStatus(user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func ClaimDailyCredits(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	result, err := service.ClaimDailyCredits(user.ID)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

func RedeemMarketingCode(w http.ResponseWriter, r *http.Request) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var request redeemCodeRequest
	_ = json.NewDecoder(r.Body).Decode(&request)
	result, err := service.RedeemMarketingCode(user.ID, request.Code)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, result)
}

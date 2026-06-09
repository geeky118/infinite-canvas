package handler

import (
	"encoding/json"
	"net/http"

	"github.com/basketikun/infinite-canvas/service"
)

type saveUserDataRequest struct {
	Payload json.RawMessage `json:"payload"`
}

func UserData(w http.ResponseWriter, r *http.Request, domain string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	data, err := service.GetUserData(user.ID, domain)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, data)
}

func SaveUserData(w http.ResponseWriter, r *http.Request, domain string) {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		Fail(w, "未登录或权限不足")
		return
	}
	var request saveUserDataRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		Fail(w, "请求格式错误")
		return
	}
	data, err := service.SaveUserData(user.ID, domain, request.Payload)
	if err != nil {
		FailError(w, err)
		return
	}
	OK(w, data)
}

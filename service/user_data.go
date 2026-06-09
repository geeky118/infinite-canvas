package service

import (
	"encoding/json"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

type UserDataPayload struct {
	Domain    string          `json:"domain"`
	Payload   json.RawMessage `json:"payload"`
	UpdatedAt string          `json:"updatedAt"`
}

var allowedUserDataDomains = map[string]bool{
	"canvas":    true,
	"ai-config": true,
	"assets":    true,
}

func GetUserData(userID string, domain string) (UserDataPayload, error) {
	domain, err := normalizeUserDataDomain(domain)
	if err != nil {
		return UserDataPayload{}, err
	}
	data, ok, err := repository.GetUserData(userID, domain)
	if err != nil {
		return UserDataPayload{}, err
	}
	if !ok {
		return UserDataPayload{Domain: domain, Payload: json.RawMessage("null")}, nil
	}
	return UserDataPayload{Domain: data.Domain, Payload: json.RawMessage(data.Payload), UpdatedAt: data.UpdatedAt}, nil
}

func SaveUserData(userID string, domain string, payload json.RawMessage) (UserDataPayload, error) {
	domain, err := normalizeUserDataDomain(domain)
	if err != nil {
		return UserDataPayload{}, err
	}
	if !json.Valid(payload) {
		return UserDataPayload{}, safeMessageError{message: "用户数据格式无效"}
	}
	saved, ok, err := repository.GetUserData(userID, domain)
	if err != nil {
		return UserDataPayload{}, err
	}
	timestamp := now()
	if !ok {
		saved = model.UserData{
			ID:        newID("ud"),
			UserID:    userID,
			Domain:    domain,
			CreatedAt: timestamp,
		}
	}
	saved.Payload = string(payload)
	saved.UpdatedAt = timestamp
	saved, err = repository.SaveUserData(saved)
	if err != nil {
		return UserDataPayload{}, err
	}
	return UserDataPayload{Domain: saved.Domain, Payload: json.RawMessage(saved.Payload), UpdatedAt: saved.UpdatedAt}, nil
}

func normalizeUserDataDomain(domain string) (string, error) {
	domain = strings.TrimSpace(domain)
	if !allowedUserDataDomains[domain] {
		return "", safeMessageError{message: "用户数据类型无效"}
	}
	return domain, nil
}

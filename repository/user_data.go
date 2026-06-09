package repository

import (
	"errors"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

func GetUserData(userID string, domain string) (model.UserData, bool, error) {
	db, err := DB()
	if err != nil {
		return model.UserData{}, false, err
	}
	var data model.UserData
	err = db.Where("user_id = ? AND domain = ?", userID, domain).First(&data).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.UserData{}, false, nil
	}
	return data, err == nil, err
}

func SaveUserData(data model.UserData) (model.UserData, error) {
	db, err := DB()
	if err != nil {
		return data, err
	}
	return data, db.Save(&data).Error
}

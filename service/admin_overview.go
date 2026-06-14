package service

import (
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func AdminOverview() (model.AdminOverview, error) {
	return repository.AdminOverview()
}

package service

import (
	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

func AdminOverview(moduleTotal int, groupTotal int, permissions []string) (model.AdminOverview, error) {
	result, err := repository.AdminOverview()
	if err != nil {
		return result, err
	}
	result.SystemModules = model.AdminOverviewModules{Total: moduleTotal, Groups: groupTotal, Permissions: permissions}
	return result, nil
}

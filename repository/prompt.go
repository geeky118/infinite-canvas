package repository

import (
	"errors"
	"sort"
	"strings"

	"github.com/basketikun/infinite-canvas/model"
	"gorm.io/gorm"
)

// PromptCategories 返回内置提示词分类的副本。
func PromptCategories() []model.PromptCategory {
	result := make([]model.PromptCategory, len(promptCategories))
	copy(result, promptCategories)
	return result
}

// PromptCategoryByCode 根据分类编码查找内置提示词分类。
func PromptCategoryByCode(category string) (model.PromptCategory, bool) {
	for _, item := range promptCategories {
		if item.Category == category {
			return item, true
		}
	}
	return model.PromptCategory{}, false
}

// ListPromptCategories 返回内置提示词分类。
func ListPromptCategories() ([]model.PromptCategory, error) {
	return PromptCategories(), nil
}

// ListPromptCategoryCodesWithPrompts 返回当前已有提示词数据的分类编码。
func ListPromptCategoryCodesWithPrompts() ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var savedCodes []string
	if err := db.Model(&model.Prompt{}).Where("category <> ''").Group("category").Pluck("category", &savedCodes).Error; err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, code := range savedCodes {
		seen[code] = true
	}
	codes := []string{}
	for _, item := range PromptCategories() {
		if seen[item.Category] {
			codes = append(codes, item.Category)
			delete(seen, item.Category)
		}
	}
	for _, code := range savedCodes {
		if seen[code] {
			codes = append(codes, code)
			delete(seen, code)
		}
	}
	return codes, nil
}

// ListPrompts 按查询条件返回提示词分页列表。
func ListPrompts(q model.Query) ([]model.Prompt, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []model.Prompt
	if err := tx.Order("CASE WHEN cover_url <> '' THEN 0 ELSE 1 END, updated_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	categories, _ := ListPromptCategories()
	githubURLs := map[string]string{}
	for _, item := range categories {
		githubURLs[item.Category] = item.GithubURL
	}
	for i := range items {
		items[i].GithubURL = githubURLs[items[i].Category]
	}
	return items, total, nil
}

// ListPromptTags 返回当前提示词查询条件下的全部标签。
func ListPromptTags(q model.Query) ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	q.Normalize()
	q.Tags = nil
	tx := applyPromptFilters(db.Model(&model.Prompt{}), q)

	var items []model.Prompt
	if err := tx.Select("tags").Find(&items).Error; err != nil {
		return nil, err
	}
	return promptTagsFromItems(items), nil
}

// ListPromptTextsExcludingCategory 返回其它分类已保存的提示词正文，用于远程源入库前去重。
func ListPromptTextsExcludingCategory(category string) ([]string, error) {
	db, err := DB()
	if err != nil {
		return nil, err
	}
	var prompts []string
	if err := db.Model(&model.Prompt{}).Where("category <> ?", category).Pluck("prompt", &prompts).Error; err != nil {
		return nil, err
	}
	return prompts, nil
}

// SavePrompt 保存提示词，并在更新时保留原创建时间。
func SavePrompt(item model.Prompt) (model.Prompt, error) {
	db, err := DB()
	if err != nil {
		return item, err
	}
	if saved, ok, err := findPrompt(db, item.ID); err != nil {
		return item, err
	} else if ok && item.CreatedAt == "" {
		item.CreatedAt = saved.CreatedAt
	}
	item.GithubURL = ""
	return item, db.Save(&item).Error
}

// DeletePrompt 删除指定提示词。
func DeletePrompt(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Prompt{}, "id = ?", id).Error
}

// DeletePrompts 批量删除提示词。
func DeletePrompts(ids []string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.Prompt{}, "id IN ?", ids).Error
}

// ReplacePromptCategory 用远程同步结果替换整个提示词分类。
func ReplacePromptCategory(category model.PromptCategory, items []model.Prompt) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("category = ?", category.Category).Delete(&model.Prompt{}).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return deleteDuplicatePrompts(tx)
		}
		for i := range items {
			items[i].Category = category.Category
			items[i].GithubURL = ""
		}
		if err := tx.CreateInBatches(&items, 200).Error; err != nil {
			return err
		}
		return deleteDuplicatePrompts(tx)
	})
}

// deleteDuplicatePrompts 清理全库重复提示词，防止远程源定时同步后再次写出重复数据。
func deleteDuplicatePrompts(tx *gorm.DB) error {
	var items []model.Prompt
	if err := tx.Select("id", "category", "prompt", "created_at").Find(&items).Error; err != nil {
		return err
	}
	rank := promptCategoryRank()
	groups := map[string][]model.Prompt{}
	for _, item := range items {
		key := promptDedupeKey(item.Prompt)
		if key != "" {
			groups[key] = append(groups[key], item)
		}
	}
	ids := []string{}
	for _, group := range groups {
		if len(group) <= 1 {
			continue
		}
		sort.SliceStable(group, func(i, j int) bool {
			left := rank[group[i].Category]
			if left == 0 {
				left = len(rank) + 1
			}
			right := rank[group[j].Category]
			if right == 0 {
				right = len(rank) + 1
			}
			if left != right {
				return left < right
			}
			if group[i].CreatedAt != group[j].CreatedAt {
				return group[i].CreatedAt < group[j].CreatedAt
			}
			return group[i].ID < group[j].ID
		})
		for _, item := range group[1:] {
			ids = append(ids, item.ID)
		}
	}
	for len(ids) > 0 {
		end := 500
		if len(ids) < end {
			end = len(ids)
		}
		if err := tx.Delete(&model.Prompt{}, "id IN ?", ids[:end]).Error; err != nil {
			return err
		}
		ids = ids[end:]
	}
	return nil
}

func promptCategoryRank() map[string]int {
	result := map[string]int{}
	for i, item := range PromptCategories() {
		result[item.Category] = i + 1
	}
	return result
}

func promptDedupeKey(prompt string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(prompt))), " ")
}

// applyPromptFilters 应用提示词列表的搜索条件。
func applyPromptFilters(tx *gorm.DB, q model.Query) *gorm.DB {
	if q.Keyword != "" {
		like := "%" + q.Keyword + "%"
		tx = tx.Where("title LIKE ? OR prompt LIKE ?", like, like)
	}
	if isActivePromptOption(q.Category) {
		tx = tx.Where("category = ?", q.Category)
	}
	return applyPromptTagsFilter(tx, q.Tags)
}

// findPrompt 根据 ID 查询提示词。
func findPrompt(db *gorm.DB, id string) (model.Prompt, bool, error) {
	item := model.Prompt{}
	err := db.Where("id = ?", id).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.Prompt{}, false, nil
	}
	return item, err == nil, err
}

// applyPromptTagsFilter 应用 JSON 标签条件。
func applyPromptTagsFilter(tx *gorm.DB, tags []string) *gorm.DB {
	if len(tags) == 0 {
		return tx
	}
	condition := tx.Session(&gorm.Session{NewDB: true})
	for _, tag := range tags {
		condition = condition.Or(promptJSONTagsContains(tx), tag)
	}
	return tx.Where(condition)
}

func promptTagsFromItems(items []model.Prompt) []string {
	seen := map[string]bool{}
	tags := []string{}
	for _, item := range items {
		for _, tag := range item.Tags {
			if tag != "" && !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	return tags
}

// promptJSONTagsContains 返回提示词 tags 的 JSON 包含条件。
func promptJSONTagsContains(tx *gorm.DB) string {
	switch tx.Dialector.Name() {
	case "mysql":
		return "JSON_CONTAINS(tags, JSON_QUOTE(?))"
	case "postgres":
		return "jsonb_exists(tags::jsonb, ?)"
	default:
		return "EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)"
	}
}

// isActivePromptOption 判断提示词筛选项有效状态。
func isActivePromptOption(value string) bool {
	return value != "" && value != "全部" && value != "all"
}

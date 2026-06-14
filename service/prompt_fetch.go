package service

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/basketikun/infinite-canvas/model"
	"github.com/basketikun/infinite-canvas/repository"
)

const (
	gptImage2RawBase             = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main"
	awesomeGptImageRawBase       = "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main"
	awesomeGpt4oImagePromptsBase = "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main"
	youMindGptImage2RawBase      = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main"
	youMindNanoBananaProRawBase  = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main"
	davidWuGptImage2RawBase      = "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main"
	youMindAIImagePromptsRawBase = "https://raw.githubusercontent.com/YouMind-OpenLab/ai-image-prompts-skill/main"
	nexraAIImagePromptsRawBase   = "https://raw.githubusercontent.com/NeXra-AI/awesome-ai-image-prompts/main"
	nanoBananaTrendingRawBase    = "https://raw.githubusercontent.com/jau123/nanobanana-trending-prompts/main"
	awesomeAIImagePromptsRawBase = "https://raw.githubusercontent.com/devanshug2307/Awesome-AI-Image-Prompts/main"
	ultimateImagePromptsRawBase  = "https://raw.githubusercontent.com/0aicoder0/Ultimate-ChatGPT-Image-and-Nano-Banana-Pro-Collection/main"
	clipriseProductRawBase       = "https://raw.githubusercontent.com/cliprise/awesome-ai-product-photography-prompts/main"
	aitools12GptImage2RawBase    = "https://raw.githubusercontent.com/aitools12/awesome-gpt-image-2/main"
)

var gptImage2CaseFiles = []string{"README.md", "cases/ad-creative.md", "cases/character.md", "cases/comparison.md", "cases/ecommerce.md", "cases/portrait.md", "cases/poster.md", "cases/ui.md"}
var youMindAIImagePromptFiles = []string{"profile-avatar.json", "social-media-post.json", "infographic-edu-visual.json", "youtube-thumbnail.json", "comic-storyboard.json", "product-marketing.json", "ecommerce-main-image.json", "game-asset.json", "poster-flyer.json", "app-web-design.json", "others.json"}

type gptImage2Data struct {
	Records []struct {
		Title    string `json:"title"`
		TweetURL string `json:"tweet_url"`
		ImageDir string `json:"image_dir"`
		Category string `json:"category"`
		AddedAt  string `json:"added_at"`
	} `json:"records"`
}

type davidWuGptImage2Prompt struct {
	ID         int    `json:"id"`
	TitleEN    string `json:"title_en"`
	TitleCN    string `json:"title_cn"`
	Category   string `json:"category"`
	CategoryCN string `json:"category_cn"`
	Prompt     string `json:"prompt"`
	Note       string `json:"note"`
	Author     string `json:"author"`
	Source     string `json:"source"`
	NeedsRef   bool   `json:"needs_ref"`
	Image      string `json:"image"`
}

type youMindAIImagePrompt struct {
	ID                  int      `json:"id"`
	Title               string   `json:"title"`
	Description         string   `json:"description"`
	Content             string   `json:"content"`
	SourceMedia         []string `json:"sourceMedia"`
	NeedReferenceImages bool     `json:"needReferenceImages"`
}

type nexraAIImagePrompt struct {
	ID            string              `json:"id"`
	Title         string              `json:"title"`
	TitleEN       string              `json:"title_en"`
	TitleZH       string              `json:"title_zh"`
	Prompt        string              `json:"prompt"`
	PromptZH      string              `json:"prompt_zh"`
	Category      string              `json:"category"`
	CategoryLabel string              `json:"category_label"`
	ImageURL      string              `json:"image_url"`
	HasImage      bool                `json:"has_image"`
	Source        string              `json:"source"`
	SourceURL     string              `json:"source_url"`
	Author        string              `json:"author"`
	License       string              `json:"license"`
	QualityScore  int                 `json:"quality_score"`
	SEOKeywords   map[string][]string `json:"seo_keywords"`
}

type nanoBananaTrendingPrompt struct {
	Rank       int      `json:"rank"`
	ID         string   `json:"id"`
	Prompt     string   `json:"prompt"`
	Author     string   `json:"author"`
	AuthorName string   `json:"author_name"`
	Likes      int      `json:"likes"`
	Views      int      `json:"views"`
	Image      string   `json:"image"`
	Images     []string `json:"images"`
	Model      string   `json:"model"`
	Categories []string `json:"categories"`
	Rating     int      `json:"rating"`
	Score      float64  `json:"score"`
	Date       string   `json:"date"`
	SourceURL  string   `json:"source_url"`
}

func SyncPromptCategory(category string) ([]model.PromptCategory, error) {
	for _, item := range repository.PromptCategories() {
		if item.Category != category {
			continue
		}
		items, err := buildPromptCategory(item.Category)
		if err != nil {
			return nil, err
		}
		items, err = dedupePromptsAgainstSaved(item.Category, items)
		if err != nil {
			return nil, err
		}
		if err := repository.ReplacePromptCategory(item, items); err != nil {
			return nil, err
		}
		return repository.ListPromptCategories()
	}
	return nil, errors.New("未知提示词分类")
}

func dedupePromptsAgainstSaved(category string, items []model.Prompt) ([]model.Prompt, error) {
	savedPrompts, err := repository.ListPromptTextsExcludingCategory(category)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, prompt := range savedPrompts {
		if key := promptDedupeKey(prompt); key != "" {
			seen[key] = true
		}
	}
	result := []model.Prompt{}
	for _, item := range dedupePrompts(items) {
		key := promptDedupeKey(item.Prompt)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result, nil
}

func buildPromptCategory(category string) ([]model.Prompt, error) {
	switch category {
	case "gpt-image-2-prompts":
		return buildGptImage2Prompts()
	case "awesome-gpt-image":
		return buildAwesomeGptImagePrompts()
	case "awesome-gpt4o-image-prompts":
		return buildAwesomeGpt4oImagePrompts()
	case "youmind-gpt-image-2":
		return buildYouMindGptImage2Prompts()
	case "youmind-nano-banana-pro":
		return buildYouMindNanoBananaProPrompts()
	case "davidwu-gpt-image2-prompts":
		return buildDavidWuGptImage2Prompts()
	case "youmind-ai-image-prompts":
		return buildYouMindAIImagePrompts()
	case "nexra-ai-image-prompts":
		return buildNexraAIImagePrompts()
	case "nanobanana-trending-prompts":
		return buildNanoBananaTrendingPrompts()
	case "awesome-ai-image-prompts":
		return buildAwesomeAIImagePrompts()
	case "ultimate-gpt-image-nano-banana":
		return buildUltimateImagePrompts()
	case "cliprise-product-photography":
		return buildClipriseProductPrompts()
	case "aitools12-gpt-image-2":
		return buildAitools12GptImage2Prompts()
	}
	return nil, errors.New("未知提示词分类")
}

func fetchText(baseURL, file string) (string, error) {
	request, _ := http.NewRequest(http.MethodGet, baseURL+"/"+file, nil)
	client := http.Client{Timeout: 30 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", errors.New(file + " 拉取失败")
	}
	data, err := io.ReadAll(response.Body)
	return string(data), err
}

func buildGptImage2Prompts() ([]model.Prompt, error) {
	cases := map[string]string{}
	raw, err := fetchText(gptImage2RawBase, "data/ingested_tweets.json")
	if err != nil {
		return nil, err
	}
	data := gptImage2Data{}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return nil, err
	}
	for _, file := range gptImage2CaseFiles {
		markdown, err := fetchText(gptImage2RawBase, file)
		if err != nil {
			return nil, err
		}
		collectGptImage2Cases(cases, markdown)
	}
	items := []model.Prompt{}
	for _, item := range data.Records {
		prompt := cases[item.TweetURL]
		if prompt == "" {
			continue
		}
		image := gptImage2RawBase + "/" + item.ImageDir + "/output.jpg"
		items = append(items, model.Prompt{ID: "gpt-image-2-prompts-" + leftPad(len(items)+1), Title: item.Title, CoverURL: image, Prompt: prompt, Tags: tagsFromCategory(item.Category), CreatedAt: item.AddedAt, UpdatedAt: item.AddedAt, Preview: markdownPreview([]string{image})})
	}
	return items, nil
}

func collectGptImage2Cases(cases map[string]string, markdown string) {
	re := regexp.MustCompile("(?s)### Case \\d+: \\[[^\\]]+\\]\\(([^)]+)\\).*?\\*\\*Prompt:\\*\\*\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n(.*?)\\r?\\n```")
	for _, match := range re.FindAllStringSubmatch(markdown, -1) {
		cases[match[1]] = strings.TrimSpace(match[2])
	}
}

func buildAwesomeGptImagePrompts() ([]model.Prompt, error) {
	markdown, err := fetchText(awesomeGptImageRawBase, "README.zh-CN.md")
	if err != nil {
		return nil, err
	}
	items := []model.Prompt{}
	for _, section := range splitBeforeHeading(markdown, "## ") {
		tags := tagsFromHeading(firstMatch(section, `(?m)^##\s+(.+)$`))
		for _, block := range splitBeforeHeading(section, "### ") {
			title := strings.TrimSpace(regexp.MustCompile(`\[([^\]]+)]\([^)]+\)`).ReplaceAllString(firstMatch(block, `(?m)^###\s+(.+)$`), "$1"))
			prompt := strings.TrimSpace(firstMatch(block, "(?s)\\*\\*提示词:\\*\\*\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n(.*?)\\r?\\n```"))
			if title == "" || prompt == "" {
				continue
			}
			images := extractMarkdownImages(awesomeGptImageRawBase, block)
			cover := ""
			if len(images) > 0 {
				cover = images[0]
			}
			items = append(items, model.Prompt{ID: "awesome-gpt-image-" + leftPad(len(items)+1), Title: title, CoverURL: cover, Prompt: prompt, Tags: tags, Preview: markdownPreview(images)})
		}
	}
	return items, nil
}

func buildAwesomeGpt4oImagePrompts() ([]model.Prompt, error) {
	markdown, err := fetchText(awesomeGpt4oImagePromptsBase, "README.zh-CN.md")
	if err != nil {
		return nil, err
	}
	items := []model.Prompt{}
	for _, block := range splitBeforeHeading(markdown, "### ") {
		title := strings.TrimSpace(firstMatch(block, `(?m)^###\s+(.+)$`))
		prompt := strings.TrimSpace(firstMatch(block, "(?s)- \\*\\*提示词文本：\\*\\*\\s*`(.*?)`"))
		if title == "" || prompt == "" {
			continue
		}
		images := extractMarkdownImages(awesomeGpt4oImagePromptsBase, block)
		cover := ""
		if len(images) > 0 {
			cover = images[0]
		}
		items = append(items, model.Prompt{ID: "awesome-gpt4o-image-prompts-" + leftPad(len(items)+1), Title: title, CoverURL: cover, Prompt: prompt, Tags: []string{"gpt4o"}, Preview: markdownPreview(images)})
	}
	return items, nil
}

func buildYouMindGptImage2Prompts() ([]model.Prompt, error) {
	return buildYouMindPrompts(youMindGptImage2RawBase, "youmind-gpt-image-2", "gpt-image-2")
}

func buildYouMindNanoBananaProPrompts() ([]model.Prompt, error) {
	return buildYouMindPrompts(youMindNanoBananaProRawBase, "youmind-nano-banana-pro", "nano-banana-pro")
}

func buildYouMindAIImagePrompts() ([]model.Prompt, error) {
	items := []model.Prompt{}
	for _, file := range youMindAIImagePromptFiles {
		raw, err := fetchText(youMindAIImagePromptsRawBase, "references/"+file)
		if err != nil {
			return nil, err
		}
		data := []youMindAIImagePrompt{}
		if err := json.Unmarshal([]byte(raw), &data); err != nil {
			return nil, err
		}
		tag := strings.TrimSuffix(file, ".json")
		for _, item := range data {
			prompt := strings.TrimSpace(item.Content)
			title := strings.TrimSpace(item.Title)
			if title == "" || prompt == "" {
				continue
			}
			cover := firstNonEmpty(item.SourceMedia...)
			tags := splitTags(strings.ReplaceAll(tag, "-", " "), `\s+`)
			if item.NeedReferenceImages {
				tags = append(tags, "需要参考图")
			}
			items = append(items, model.Prompt{ID: "youmind-ai-image-prompts-" + tag + "-" + leftPad(item.ID), Title: title, CoverURL: cover, Prompt: prompt, Tags: tags, Preview: youMindAIImagePreview(item, cover)})
		}
	}
	return dedupePrompts(items), nil
}

func buildNexraAIImagePrompts() ([]model.Prompt, error) {
	raw, err := fetchText(nexraAIImagePromptsRawBase, "data/prompts.json")
	if err != nil {
		return nil, err
	}
	data := []nexraAIImagePrompt{}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return nil, err
	}
	items := []model.Prompt{}
	for i, item := range data {
		title := strings.TrimSpace(firstNonEmpty(item.TitleZH, item.Title, item.TitleEN))
		prompt := strings.TrimSpace(firstNonEmpty(item.PromptZH, item.Prompt))
		if title == "" || prompt == "" {
			continue
		}
		image := absoluteImage(nexraAIImagePromptsRawBase, item.ImageURL)
		tags := splitTags(strings.Join([]string{item.CategoryLabel, item.Category, item.Source, item.Author}, "/"), `/`)
		if item.QualityScore > 0 {
			tags = append(tags, "评分"+strconv.Itoa(item.QualityScore))
		}
		id := strings.TrimSpace(item.ID)
		if id == "" {
			id = leftPad(i + 1)
		}
		items = append(items, model.Prompt{ID: "nexra-ai-image-prompts-" + sanitizePromptID(id), Title: title, CoverURL: image, Prompt: prompt, Tags: tags, Preview: nexraAIImagePreview(item, image)})
	}
	return dedupePrompts(items), nil
}

func buildNanoBananaTrendingPrompts() ([]model.Prompt, error) {
	raw, err := fetchText(nanoBananaTrendingRawBase, "prompts/prompts.json")
	if err != nil {
		return nil, err
	}
	data := []nanoBananaTrendingPrompt{}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return nil, err
	}
	items := []model.Prompt{}
	for i, item := range data {
		prompt := strings.TrimSpace(item.Prompt)
		if prompt == "" {
			continue
		}
		title := "热门提示词 #" + strconv.Itoa(item.Rank)
		if item.AuthorName != "" {
			title += " by " + item.AuthorName
		} else if item.Author != "" {
			title += " by " + item.Author
		}
		cover := item.Image
		if cover == "" {
			cover = firstNonEmpty(item.Images...)
		}
		tags := append([]string{strings.ToLower(strings.TrimSpace(item.Model))}, splitTags(strings.Join(item.Categories, "/"), `/`)...)
		if item.Likes > 0 {
			tags = append(tags, "高热度")
		}
		id := strings.TrimSpace(item.ID)
		if id == "" {
			id = leftPad(i + 1)
		}
		items = append(items, model.Prompt{ID: "nanobanana-trending-prompts-" + sanitizePromptID(id), Title: title, CoverURL: cover, Prompt: prompt, Tags: tags, CreatedAt: item.Date, UpdatedAt: item.Date, Preview: nanoBananaTrendingPreview(item, cover)})
	}
	return dedupePrompts(items), nil
}

func buildAwesomeAIImagePrompts() ([]model.Prompt, error) {
	markdown, err := fetchText(awesomeAIImagePromptsRawBase, "README.md")
	if err != nil {
		return nil, err
	}
	return buildNumberedMarkdownPrompts("awesome-ai-image-prompts", awesomeAIImagePromptsRawBase, markdown), nil
}

func buildUltimateImagePrompts() ([]model.Prompt, error) {
	markdown, err := fetchText(ultimateImagePromptsRawBase, "README.md")
	if err != nil {
		return nil, err
	}
	return buildNumberedMarkdownPrompts("ultimate-gpt-image-nano-banana", ultimateImagePromptsRawBase, markdown), nil
}

func buildClipriseProductPrompts() ([]model.Prompt, error) {
	markdown, err := fetchText(clipriseProductRawBase, "README.md")
	if err != nil {
		return nil, err
	}
	return buildCodeBlockPrompts("cliprise-product-photography", clipriseProductRawBase, markdown, "product-photography"), nil
}

func buildAitools12GptImage2Prompts() ([]model.Prompt, error) {
	markdown, err := fetchText(aitools12GptImage2RawBase, "README_zh-CN.md")
	if err != nil {
		markdown, err = fetchText(aitools12GptImage2RawBase, "README.md")
	}
	if err != nil {
		return nil, err
	}
	return buildCodeBlockPrompts("aitools12-gpt-image-2", aitools12GptImage2RawBase, markdown, "gpt-image-2"), nil
}

func buildDavidWuGptImage2Prompts() ([]model.Prompt, error) {
	raw, err := fetchText(davidWuGptImage2RawBase, "prompts.json")
	if err != nil {
		return nil, err
	}
	data := []davidWuGptImage2Prompt{}
	if err := json.Unmarshal([]byte(raw), &data); err != nil {
		return nil, err
	}
	items := []model.Prompt{}
	for _, item := range data {
		title := strings.TrimSpace(item.TitleCN)
		if title == "" {
			title = strings.TrimSpace(item.TitleEN)
		}
		prompt := strings.TrimSpace(item.Prompt)
		if title == "" || prompt == "" {
			continue
		}
		image := absoluteImage(davidWuGptImage2RawBase, item.Image)
		items = append(items, model.Prompt{ID: "davidwu-gpt-image2-prompts-" + leftPad(item.ID), Title: title, CoverURL: image, Prompt: prompt, Tags: davidWuGptImage2Tags(item), Preview: davidWuGptImage2Preview(item, image)})
	}
	return items, nil
}

func buildYouMindPrompts(baseURL, idPrefix, modelTag string) ([]model.Prompt, error) {
	markdown, err := fetchText(baseURL, "README_zh.md")
	if err != nil {
		return nil, err
	}
	items := []model.Prompt{}
	for _, block := range splitBeforeHeading(markdown, "### ") {
		title := strings.TrimSpace(firstMatch(block, `(?m)^###\s+No\.\s*\d+:\s*(.+)$`))
		prompt := strings.TrimSpace(firstMatch(block, "(?s)#### .*?提示词\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n(.*?)\\r?\\n```"))
		if title == "" || prompt == "" {
			continue
		}
		images := extractMarkdownImages(baseURL, block)
		cover := ""
		if len(images) > 0 {
			cover = images[0]
		}
		items = append(items, model.Prompt{ID: idPrefix + "-" + leftPad(len(items)+1), Title: title, CoverURL: cover, Prompt: prompt, Tags: youMindTags(title, modelTag), Preview: markdownPreview(images)})
	}
	return dedupePrompts(items), nil
}

func buildNumberedMarkdownPrompts(idPrefix, baseURL, markdown string) []model.Prompt {
	items := []model.Prompt{}
	category := ""
	for _, block := range splitBeforeHeading(markdown, "## ") {
		heading := firstMatch(block, `(?m)^##\s+(.+)$`)
		if heading != "" {
			category = cleanMarkdownHeading(heading)
		}
		for _, promptBlock := range splitBeforeHeading(block, "### ") {
			title := cleanMarkdownHeading(firstMatch(promptBlock, `(?m)^###\s+(.+)$`))
			prompt := extractPromptFromMarkdownBlock(promptBlock)
			if title == "" || prompt == "" {
				continue
			}
			images := extractMarkdownImages(baseURL, promptBlock)
			items = append(items, model.Prompt{ID: idPrefix + "-" + leftPad(len(items)+1), Title: title, CoverURL: firstNonEmpty(images...), Prompt: prompt, Tags: tagsFromHeading(category), Preview: markdownPreview(images)})
		}
	}
	return dedupePrompts(items)
}

func buildCodeBlockPrompts(idPrefix, baseURL, markdown string, defaultTag string) []model.Prompt {
	items := []model.Prompt{}
	category := ""
	for _, block := range splitBeforeHeading(markdown, "## ") {
		heading := cleanMarkdownHeading(firstMatch(block, `(?m)^##\s+(.+)$`))
		if heading != "" && !strings.EqualFold(heading, "Prompt library") {
			category = heading
		}
		for _, promptBlock := range splitBeforeHeading(block, "### ") {
			title := cleanMarkdownHeading(firstMatch(promptBlock, `(?m)^###\s+(.+)$`))
			prompt := strings.TrimSpace(firstMatch(promptBlock, "(?s)```(?:text|json|[\\w-]*)\\s*\\r?\\n(.*?)\\r?\\n```"))
			if title == "" || prompt == "" {
				continue
			}
			images := extractMarkdownImages(baseURL, promptBlock)
			tags := tagsFromHeading(category)
			if defaultTag != "" {
				tags = append([]string{defaultTag}, tags...)
			}
			items = append(items, model.Prompt{ID: idPrefix + "-" + leftPad(len(items)+1), Title: title, CoverURL: firstNonEmpty(images...), Prompt: prompt, Tags: tags, Preview: markdownPreview(images)})
		}
	}
	return dedupePrompts(items)
}

func extractPromptFromMarkdownBlock(block string) string {
	for _, pattern := range []string{
		"(?s)\\*\\*Prompt:\\*\\*\\s*\\r?\\n\\s*---\\s*Prompt\\s*---\\s*\\r?\\n(.*?)(?:\\r?\\n---\\s*|\\r?\\n### |$)",
		"(?s)\\*\\*Prompt:\\*\\*\\s*\\r?\\n\\s*```[\\w-]*\\r?\\n(.*?)\\r?\\n```",
		"(?s)\\*\\*Prompt:\\*\\*\\s*\\r?\\n(.*?)(?:\\r?\\n\\*\\*|\\r?\\n### |$)",
	} {
		if prompt := strings.TrimSpace(firstMatch(block, pattern)); prompt != "" {
			return cleanExtractedPrompt(prompt)
		}
	}
	return ""
}

func cleanExtractedPrompt(prompt string) string {
	lines := []string{}
	for _, line := range strings.Split(strings.TrimSpace(prompt), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || regexp.MustCompile(`^-{3,}\s*(Prompt|Example|Output|Image|Description)?\s*-{0,}$`).MatchString(line) {
			continue
		}
		lines = append(lines, line)
	}
	return strings.Trim(strings.Join(lines, "\n"), "`")
}

func cleanMarkdownHeading(value string) string {
	value = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`\[[^\]]+]\([^)]+\)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`^[\d.]+\s*`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`\([^)]*prompts?[^)]*\)`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`[|#*_`+"`"+`]`).ReplaceAllString(value, " ")
	return strings.TrimSpace(value)
}

func splitBeforeHeading(markdown string, prefix string) []string {
	blocks := []string{}
	lines := strings.Split(markdown, "\n")
	current := []string{}
	for _, line := range lines {
		if strings.HasPrefix(line, prefix) && len(current) > 0 {
			blocks = append(blocks, strings.Join(current, "\n"))
			current = []string{}
		}
		current = append(current, line)
	}
	return append(blocks, strings.Join(current, "\n"))
}

func firstMatch(value string, pattern string) string {
	match := regexp.MustCompile(pattern).FindStringSubmatch(value)
	if len(match) > 1 {
		return match[1]
	}
	return ""
}

func tagsFromCategory(category string) []string {
	return splitTags(regexp.MustCompile(`(?i)\s+Cases$`).ReplaceAllString(category, ""), `\s*(&|and)\s*`)
}

func tagsFromHeading(heading string) []string {
	return splitTags(regexp.MustCompile(`[^\p{L}\p{N}/&、与 ]`).ReplaceAllString(heading, ""), `\s*(/|&|、|与)\s*`)
}

func youMindTags(title, modelTag string) []string {
	tags := []string{modelTag}
	parts := strings.SplitN(title, " - ", 2)
	if len(parts) > 1 {
		tags = append(tags, tagsFromHeading(parts[0])...)
	}
	return tags
}

func davidWuGptImage2Tags(item davidWuGptImage2Prompt) []string {
	tags := splitTags(strings.Join([]string{item.CategoryCN, item.Category, item.Author, item.Source}, "/"), `/`)
	if item.NeedsRef {
		tags = append(tags, "需要参考图")
	}
	return tags
}

func buildPreview(parts ...string) string {
	filtered := []string{}
	for _, p := range parts {
		if p != "" {
			filtered = append(filtered, p)
		}
	}
	return strings.Join(filtered, "\n\n")
}

func joinMetadata(items ...string) string {
	meta := []string{}
	for _, item := range items {
		if item != "" {
			meta = append(meta, item)
		}
	}
	return strings.Join(meta, " · ")
}

func previewImage(image string) string {
	if image != "" {
		return "![](" + image + ")"
	}
	return ""
}

func davidWuGptImage2Preview(item davidWuGptImage2Prompt, image string) string {
	return buildPreview(item.TitleEN, item.Note, previewImage(image))
}

func youMindAIImagePreview(item youMindAIImagePrompt, image string) string {
	refNote := ""
	if item.NeedReferenceImages {
		refNote = "需要参考图"
	}
	return buildPreview(item.Description, refNote, previewImage(image))
}

func nexraAIImagePreview(item nexraAIImagePrompt, image string) string {
	titleEN := ""
	if item.TitleEN != "" && item.TitleEN != item.TitleZH {
		titleEN = item.TitleEN
	}
	score := ""
	if item.QualityScore > 0 {
		score = "score " + strconv.Itoa(item.QualityScore)
	}
	return buildPreview(titleEN, joinMetadata(item.Author, item.License, score), previewImage(image))
}

func nanoBananaTrendingPreview(item nanoBananaTrendingPrompt, image string) string {
	views := ""
	if item.Views > 0 {
		views = strconv.Itoa(item.Views) + " views"
	}
	likes := ""
	if item.Likes > 0 {
		likes = strconv.Itoa(item.Likes) + " likes"
	}
	return buildPreview(joinMetadata(item.Model, views, likes, item.SourceURL), previewImage(image))
}

func splitTags(value string, pattern string) []string {
	tags := []string{}
	for _, tag := range regexp.MustCompile(pattern).Split(value, -1) {
		if tag = strings.ToLower(strings.TrimSpace(tag)); tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func dedupePrompts(items []model.Prompt) []model.Prompt {
	seen := map[string]bool{}
	result := []model.Prompt{}
	for _, item := range items {
		key := promptDedupeKey(item.Prompt)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		item.Tags = dedupeStrings(item.Tags)
		result = append(result, item)
	}
	return result
}

func promptDedupeKey(prompt string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(prompt))), " ")
}

func dedupeStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func sanitizePromptID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		return leftPad(0)
	}
	if len(value) > 80 {
		return value[:80]
	}
	return value
}

func markdownPreview(images []string) string {
	lines := []string{}
	for _, image := range images {
		if image != "" {
			lines = append(lines, "![]("+image+")")
		}
	}
	return strings.Join(lines, "\n\n")
}

func extractMarkdownImages(baseURL string, block string) []string {
	seen := map[string]bool{}
	images := []string{}
	for _, pattern := range []string{`<img[^>]+src="([^"]+)"`, `!\[[^\]]*]\(([^)]+)\)`} {
		for _, match := range regexp.MustCompile(pattern).FindAllStringSubmatch(block, -1) {
			image := absoluteImage(baseURL, match[1])
			if image != "" && !seen[image] {
				seen[image] = true
				images = append(images, image)
			}
		}
	}
	return images
}

func absoluteImage(baseURL, image string) string {
	if image == "" || strings.HasPrefix(image, "http://") || strings.HasPrefix(image, "https://") {
		return image
	}
	return baseURL + "/" + strings.TrimLeft(strings.TrimPrefix(image, "."), "/")
}

func leftPad(value int) string {
	if value >= 1000 {
		return strconv.Itoa(value)
	}
	text := "000" + strconv.Itoa(value)
	return text[len(text)-3:]
}

package service

import "sync"

var concurrency = newConcurrencyManager()

type concurrencyManager struct {
	mu     sync.Mutex
	counts map[string]int
}

func newConcurrencyManager() *concurrencyManager {
	return &concurrencyManager{counts: make(map[string]int)}
}

// AcquireConcurrent 尝试为用户获取一个并发槽，成功返回 true，已满返回 false。
func AcquireConcurrent(userID string) bool {
	limit := MaxConcurrentRequests()
	concurrency.mu.Lock()
	defer concurrency.mu.Unlock()
	if concurrency.counts[userID] >= limit {
		return false
	}
	concurrency.counts[userID]++
	return true
}

// ReleaseConcurrent 释放用户的一个并发槽。
func ReleaseConcurrent(userID string) {
	concurrency.mu.Lock()
	defer concurrency.mu.Unlock()
	if concurrency.counts[userID] > 0 {
		concurrency.counts[userID]--
	}
	if concurrency.counts[userID] == 0 {
		delete(concurrency.counts, userID)
	}
}

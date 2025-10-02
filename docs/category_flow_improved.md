# Cải tiến Category Resolution Service

## 1. Vấn đề hiện tại

- Thiếu validation khi AI suggestion được tạo
- Không có mechanism để học từ user behavior
- Thiếu cleanup cho suggestions cũ
- Không có fallback khi AI service down

## 2. Cải tiến đề xuất

### A. Enhanced Category Resolution Logic

```javascript
// services/categoryResolutionService.js - Enhanced version
export const resolveCategory = async (
  userId,
  { categoryId, categoryName },
  options = {},
) => {
  const { enableAI = true, confidence = 0.7 } = options;

  // Step 1: Explicit category ID
  if (categoryId) {
    const category = await ExpenseCategory.findById(categoryId);
    if (!category) {
      throw new CategoryNotFoundError('Category not found');
    }
    await recordCategoryUsageEvent(userId, category._id, {
      source: 'explicit',
    });
    return {
      categoryId: category._id,
      needsConfirmation: false,
      matchedSource: 'explicit',
      confidence: 1.0,
    };
  }

  const normalizedName = normalize(categoryName);
  if (!normalizedName) {
    return { categoryId: null, needsConfirmation: false, confidence: 0 };
  }

  // Step 2: User mapping (highest priority)
  const userCategory = await findUserCategory(userId, normalizedName);
  if (userCategory?.category?._id) {
    await recordCategoryUsageEvent(userId, userCategory.category._id, {
      source: 'user_mapping',
    });
    return {
      categoryId: userCategory.category._id,
      needsConfirmation: false,
      matchedSource: 'user',
      confidence: 0.95,
    };
  }

  // Step 3: System category with fuzzy matching
  const systemCategory = await findSystemCategoryWithFuzzy(normalizedName);
  if (systemCategory?.match && systemCategory.confidence >= confidence) {
    await recordCategoryUsageEvent(userId, systemCategory.category._id, {
      source: 'system_fuzzy',
    });
    return {
      categoryId: systemCategory.category._id,
      needsConfirmation: false,
      matchedSource: 'system',
      confidence: systemCategory.confidence,
    };
  }

  // Step 4: AI suggestion (if enabled)
  if (enableAI) {
    try {
      const aiSuggestion = await getAISuggestion(
        userId,
        categoryName,
        normalizedName,
      );
      if (aiSuggestion && aiSuggestion.confidence >= confidence) {
        const suggestion = await upsertCategorySuggestion(
          userId,
          categoryName,
          normalizedName,
          aiSuggestion,
        );

        return {
          categoryId: null,
          needsConfirmation: true,
          matchedSource: null,
          confidence: aiSuggestion.confidence,
          suggestion: {
            id: suggestion._id,
            name: categoryName,
            normalizedName,
            aiSuggestions: aiSuggestion.suggestions,
          },
        };
      }
    } catch (error) {
      console.error('AI suggestion failed:', error);
      // Fallback to manual categorization
    }
  }

  // Step 5: Fallback - create uncategorized suggestion
  const suggestion = await upsertCategorySuggestion(
    userId,
    categoryName,
    normalizedName,
    { suggestions: [], confidence: 0 },
  );

  return {
    categoryId: null,
    needsConfirmation: true,
    matchedSource: null,
    confidence: 0,
    suggestion: {
      id: suggestion._id,
      name: categoryName,
      normalizedName,
      aiSuggestions: [],
    },
  };
};
```

### B. AI Enhancement với Learning

```javascript
// services/ai/categoryLearningService.js
export const learnFromUserBehavior = async (userId) => {
  const recentConfirmations = await UserExpenseCategory.find({
    user: userId,
    needsConfirmation: false,
    createdBy: 'ai',
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days
  }).populate('category');

  const patterns = {};
  for (const confirmation of recentConfirmations) {
    const pattern = confirmation.normalizedName;
    const categoryId = confirmation.category._id;

    if (!patterns[pattern]) {
      patterns[pattern] = { categoryId, count: 0 };
    }
    patterns[pattern].count++;
  }

  // Update AI model weights based on patterns
  await updateCategoryDictionary(userId, patterns);

  return patterns;
};
```

### C. Background Jobs

```javascript
// jobs/categoryMaintenanceJob.js
export const categoryMaintenanceJob = async () => {
  // Cleanup old unconfirmed suggestions
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const cleanupResult = await UserExpenseCategory.deleteMany({
    needsConfirmation: true,
    isActive: false,
    createdAt: { $lt: cutoffDate },
  });

  console.log(`Cleaned up ${cleanupResult.deletedCount} old suggestions`);

  // Learn from user behavior for active users
  const activeUsers = await User.find({
    lastActiveAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  })
    .select('_id')
    .limit(100);

  for (const user of activeUsers) {
    try {
      await learnFromUserBehavior(user._id);
    } catch (error) {
      console.error(`Learning failed for user ${user._id}:`, error);
    }
  }
};
```

## 3. API Improvements

### Enhanced Confirmation Endpoint

```javascript
// controllers/categoryController.js
const confirmSuggestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, systemCategoryId, categoryName, feedback } = req.body;
    const userId = req.user._id;

    // Validate action
    if (!['accept_system', 'create_new', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be accept_system, create_new, or reject',
      });
    }

    let result;
    switch (action) {
      case 'accept_system':
        if (!systemCategoryId) {
          return res.status(400).json({
            success: false,
            message: 'systemCategoryId is required for accept_system action',
          });
        }
        result = await categoryResolutionService.confirmCategorySuggestion(
          userId,
          {
            suggestionId: id,
            systemCategoryId,
            feedback,
          },
        );
        break;

      case 'create_new':
        if (!categoryName) {
          return res.status(400).json({
            success: false,
            message: 'categoryName is required for create_new action',
          });
        }
        result = await categoryResolutionService.confirmCategorySuggestion(
          userId,
          {
            suggestionId: id,
            categoryName,
            feedback,
          },
        );
        break;

      case 'reject':
        result = await categoryResolutionService.rejectCategorySuggestion(
          userId,
          id,
          feedback,
        );
        break;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleControllerError(res, error);
  }
};
```

## 4. Performance Optimizations

### A. Caching Strategy

```javascript
// Cache frequently used categories
const CACHE_TTL = 60 * 15; // 15 minutes

export const getCachedSystemCategories = async () => {
  const cacheKey = 'system_categories';
  let categories = await redisClient.get(cacheKey);

  if (!categories) {
    categories = await ExpenseCategory.find({ isSystem: true }).lean();
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(categories));
  } else {
    categories = JSON.parse(categories);
  }

  return categories;
};
```

### B. Batch Operations

```javascript
// Batch confirm multiple suggestions
export const batchConfirmSuggestions = async (userId, confirmations) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const results = [];

      for (const confirmation of confirmations) {
        const result = await confirmCategorySuggestion(userId, confirmation, {
          session,
        });
        results.push(result);
      }

      return results;
    });
  } finally {
    await session.endSession();
  }
};
```

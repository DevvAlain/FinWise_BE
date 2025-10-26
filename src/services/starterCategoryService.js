const ExpenseCategory = require('../models/expense_category.js');
const UserExpenseCategory = require('../models/user_expense_category.js');
import { publishDomainEvents } from '../events/domainEvents.js';

// Default starter categories cho user mới
const DEFAULT_STARTER_CATEGORIES = [
    {
        name: 'Ăn uống',
        nameEn: 'Food & Dining',
        icon: '🍽️',
        color: '#FF6B6B',
        normalizedNames: ['ăn uống', 'ăn', 'uống', 'food', 'dining', 'restaurant', 'cafe', 'coffee']
    },
    {
        name: 'Di chuyển',
        nameEn: 'Transportation',
        icon: '🚗',
        color: '#4ECDC4',
        normalizedNames: ['di chuyển', 'xe', 'giao thông', 'transport', 'taxi', 'grab', 'xăng', 'petrol']
    },
    {
        name: 'Mua sắm',
        nameEn: 'Shopping',
        icon: '🛍️',
        color: '#45B7D1',
        normalizedNames: ['mua sắm', 'shopping', 'quần áo', 'clothes', 'fashion', 'mua', 'sắm']
    },
    {
        name: 'Giải trí',
        nameEn: 'Entertainment',
        icon: '🎬',
        color: '#96CEB4',
        normalizedNames: ['giải trí', 'entertainment', 'phim', 'movie', 'game', 'vui chơi', 'cinema']
    },
    {
        name: 'Hóa đơn & Tiện ích',
        nameEn: 'Bills & Utilities',
        icon: '💡',
        color: '#FECA57',
        normalizedNames: ['hóa đơn', 'tiện ích', 'bill', 'utilities', 'điện', 'nước', 'gas', 'internet', 'phone']
    },
    {
        name: 'Sức khỏe',
        nameEn: 'Healthcare',
        icon: '⚕️',
        color: '#FF9FF3',
        normalizedNames: ['sức khỏe', 'y tế', 'health', 'hospital', 'doctor', 'medicine', 'thuốc', 'bác sĩ']
    },
    {
        name: 'Giáo dục',
        nameEn: 'Education',
        icon: '📚',
        color: '#54A0FF',
        normalizedNames: ['giáo dục', 'học', 'education', 'course', 'book', 'school', 'học phí']
    },
    {
        name: 'Gia đình',
        nameEn: 'Family',
        icon: '👨‍👩‍👧‍👦',
        color: '#FF7675',
        normalizedNames: ['gia đình', 'family', 'con cái', 'children', 'baby', 'trẻ em']
    },
    {
        name: 'Khác',
        nameEn: 'Others',
        icon: '📝',
        color: '#8395A7',
        normalizedNames: ['khác', 'others', 'misc', 'miscellaneous']
    }
];

/**
 * Tạo starter categories cho user mới đăng ký
 */
export const createStarterCategoriesForUser = async (userId) => {
    try {
        console.log(`🎯 Creating starter categories for user ${userId}...`);

        // Kiểm tra xem user đã có categories chưa
        const existingCategories = await UserExpenseCategory.countDocuments({
            user: userId,
            isActive: true
        });

        if (existingCategories > 0) {
            console.log(`User ${userId} already has ${existingCategories} categories, skipping starter creation`);
            return;
        }

        const createdCategories = [];

        for (const categoryData of DEFAULT_STARTER_CATEGORIES) {
            // Tìm hoặc tạo system category
            let systemCategory = await ExpenseCategory.findOne({
                $or: [
                    { name: categoryData.name },
                    { nameEn: categoryData.nameEn }
                ]
            });

            if (!systemCategory) {
                systemCategory = await ExpenseCategory.create({
                    name: categoryData.name,
                    nameEn: categoryData.nameEn,
                    icon: categoryData.icon,
                    color: categoryData.color,
                    isSystem: true
                });
            }

            // Tạo user mapping cho category này (check duplicate first)
            let userCategory = await UserExpenseCategory.findOne({
                user: userId,
                category: systemCategory._id
            });

            if (!userCategory) {
                // use upsert to avoid duplicate key when called concurrently
                userCategory = await UserExpenseCategory.findOneAndUpdate(
                    { user: userId, normalizedName: categoryData.name.toLowerCase() },
                    {
                        $set: {
                            user: userId,
                            category: systemCategory._id,
                            customName: categoryData.name,
                            normalizedName: categoryData.name.toLowerCase(),
                            needsConfirmation: false,
                            isActive: true,
                            createdBy: 'system',
                        },
                        $setOnInsert: { createdAt: new Date() },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true },
                );
            }

            createdCategories.push({
                systemCategory,
                userCategory,
                normalizedNames: categoryData.normalizedNames
            });
        }

        // Publish event
        await publishDomainEvents([
            {
                name: 'user.starter_categories_created',
                payload: {
                    userId,
                    categoriesCount: createdCategories.length,
                    categories: createdCategories.map(c => ({
                        id: c.systemCategory._id,
                        name: c.systemCategory.name,
                        icon: c.systemCategory.icon
                    }))
                }
            }
        ]);

        console.log(`✅ Created ${createdCategories.length} starter categories for user ${userId}`);
        return createdCategories;

    } catch (error) {
        console.error(`❌ Failed to create starter categories for user ${userId}:`, error);
        throw error;
    }
};

/**
 * Lấy tất cả system categories có thể dùng cho mapping
 */
export const getSystemCategoriesMapping = async () => {
    const categories = await ExpenseCategory.find({ isSystem: true }).lean();

    const mapping = {};

    for (const category of categories) {
        // Tìm category config tương ứng
        const config = DEFAULT_STARTER_CATEGORIES.find(
            c => c.name === category.name || c.nameEn === category.nameEn
        );

        if (config) {
            // Map tất cả normalized names tới category này
            for (const normalizedName of config.normalizedNames) {
                mapping[normalizedName] = {
                    categoryId: category._id,
                    name: category.name,
                    confidence: 0.9 // High confidence cho exact matches
                };
            }
        }
    }

    return mapping;
};

/**
 * Enhanced system category finder với starter categories mapping
 */
export const findSystemCategoryEnhanced = async (normalizedName) => {
    if (!normalizedName) return null;

    // Lấy mapping
    const mapping = await getSystemCategoriesMapping();

    // Exact match
    if (mapping[normalizedName]) {
        return {
            category: await ExpenseCategory.findById(mapping[normalizedName].categoryId),
            confidence: mapping[normalizedName].confidence,
            matchType: 'exact'
        };
    }

    // Fuzzy match
    for (const [key, value] of Object.entries(mapping)) {
        if (key.includes(normalizedName) || normalizedName.includes(key)) {
            return {
                category: await ExpenseCategory.findById(value.categoryId),
                confidence: value.confidence * 0.7, // Lower confidence cho fuzzy match
                matchType: 'fuzzy'
            };
        }
    }

    return null;
};

export default {
    createStarterCategoriesForUser,
    getSystemCategoriesMapping,
    findSystemCategoryEnhanced,
    DEFAULT_STARTER_CATEGORIES
};
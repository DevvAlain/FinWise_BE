// Simple Vietnamese -> canonical category name mapping
// Extend as needed
export const CATEGORY_SYNONYMS = {
  'ăn uống': [
    'ăn',
    'ăn trưa',
    'ăn tối',
    'đồ ăn',
    'food',
    'meal',
    'cafe',
    'coffee',
    'trà sữa',
  ],
  'mua sắm': ['shopping', 'mua đồ', 'quần áo', 'shopee', 'lazada', 'tiki'],
  'di chuyển': [
    'grab',
    'be',
    'xăng',
    'gửi xe',
    'vé xe',
    'taxi',
    'bus',
    'xe buýt',
  ],
  'giải trí': ['phim', 'netflix', 'game', 'karaoke'],
  'y tế': ['khám bệnh', 'thuốc', 'bệnh viện'],
  'giáo dục': ['học phí', 'sách vở', 'khóa học'],
  'nhà cửa': ['tiền nhà', 'điện', 'nước', 'internet', 'wifi'],
  'thu nhập': ['lương', 'bonus', 'thưởng', 'income'],
};

export function mapToCanonicalCategory(input) {
  if (!input) return null;
  const text = String(input).trim().toLowerCase();
  // Direct match
  for (const canonical of Object.keys(CATEGORY_SYNONYMS)) {
    if (text === canonical) return canonical;
  }
  // Synonym match
  for (const [canonical, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    if (synonyms.some((s) => text.includes(s))) return canonical;
  }
  return null;
}

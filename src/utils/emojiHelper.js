/**
 * Utility functions for Discord emoji name formatting and sanitization.
 */

// Cyrillic to Latin transliteration map for Russian emoji names
const CYRILLIC_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

function transliterate(str) {
  if (!str) return '';
  return str.split('').map(char => CYRILLIC_MAP[char] !== undefined ? CYRILLIC_MAP[char] : char).join('');
}

/**
 * Strips leading numeric index prefix like '0001_', '02-', '1.', etc.
 * @param {string} name 
 * @returns {string} Clean base name
 */
function stripPrefix(name) {
  if (!name) return 'emoji';
  // Matches 1 to 6 digits followed by separator (_, -, ., space)
  const match = name.match(/^(\d{1,6})[_\-\s\.]+(.*)$/);
  if (match && match[2]) {
    return match[2];
  }
  return name;
}

/**
 * Sanitizes base name to conform to Discord requirements:
 * Only [a-zA-Z0-9_], 2 to 32 characters.
 * @param {string} name 
 * @returns {string} Sanitized base name
 */
function sanitizeBaseName(name) {
  if (!name) return 'emoji';
  // Transliterate Russian/Cyrillic characters to Latin
  let sanitized = transliterate(name);

  // Replace invalid characters with underscore
  sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');

  // Collapse consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // Trim leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  if (!sanitized || sanitized.length === 0) {
    sanitized = 'emoji';
  }

  return sanitized;
}

/**
 * Formats emoji name with index prefix according to options.
 * Example: 'pepe' with index 1, digits 4, sep '_' -> '0001_pepe'
 * 
 * @param {string} originalName 
 * @param {number} index - 1-based index
 * @param {object} options 
 * @param {number} [options.digits=4] - Number of zero-padded digits (default 4)
 * @param {string} [options.separator='_'] - Separator between prefix and name
 * @param {number} [options.startIndex=1] - Starting number
 * @param {boolean} [options.stripExisting=true] - Strip existing numeric prefixes
 * @returns {{ newName: string, baseName: string, isTruncated: boolean }}
 */
function formatEmojiName(originalName, index, options = {}) {
  const digits = Math.max(1, Math.min(6, parseInt(options.digits, 10) || 4));
  const separator = options.separator === '-' ? '_' : (options.separator || '_'); // Discord only allows _
  const startIndex = parseInt(options.startIndex, 10) || 1;
  const stripExisting = options.stripExisting !== false;

  const currentNumber = startIndex + (index - 1);
  const prefix = String(currentNumber).padStart(digits, '0') + separator;

  // Clean and sanitize base name
  let baseName = stripExisting ? stripPrefix(originalName) : originalName;
  baseName = sanitizeBaseName(baseName);

  // Discord emoji name length limit is 32 characters
  const maxBaseLength = Math.max(1, 32 - prefix.length);
  let isTruncated = false;

  if (baseName.length > maxBaseLength) {
    baseName = baseName.substring(0, maxBaseLength);
    // Trim trailing underscore if created by truncation
    baseName = baseName.replace(/_+$/, '');
    if (baseName.length === 0) baseName = 'e';
    isTruncated = true;
  }

  let newName = `${prefix}${baseName}`;

  // Ensure minimum length of 2 characters
  if (newName.length < 2) {
    newName = (newName + '__').substring(0, 2);
  }

  return {
    newName,
    baseName,
    isTruncated
  };
}

module.exports = {
  transliterate,
  stripPrefix,
  sanitizeBaseName,
  formatEmojiName
};

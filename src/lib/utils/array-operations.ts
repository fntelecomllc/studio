/**
 * Array Operations Utility
 * Provides immutable array operations and consistent null/undefined handling
 */

/**
 * Safely handle array vs null/undefined
 * Backend often sends null for empty arrays, frontend prefers []
 */
export function normalizeArray<T>(
  value: T[] | null | undefined,
  defaultToEmpty: boolean = true
): T[] {
  if (value === null || value === undefined) {
    return defaultToEmpty ? [] : ([] as T[]);
  }
  return Array.isArray(value) ? value : [];
}

/**
 * Check if array is empty (handles null/undefined)
 */
export function isEmptyArray<T>(
  value: T[] | null | undefined
): boolean {
  return !value || value.length === 0;
}

/**
 * Immutable array append
 */
export function arrayAppend<T>(
  array: readonly T[],
  ...items: T[]
): T[] {
  return [...array, ...items];
}

/**
 * Immutable array prepend
 */
export function arrayPrepend<T>(
  array: readonly T[],
  ...items: T[]
): T[] {
  return [...items, ...array];
}

/**
 * Immutable array remove by index
 */
export function arrayRemoveAt<T>(
  array: readonly T[],
  index: number
): T[] {
  if (index < 0 || index >= array.length) {
    return [...array];
  }
  return [...array.slice(0, index), ...array.slice(index + 1)];
}

/**
 * Immutable array remove by value
 */
export function arrayRemove<T>(
  array: readonly T[],
  value: T
): T[] {
  const index = array.indexOf(value);
  return index >= 0 ? arrayRemoveAt(array, index) : [...array];
}

/**
 * Immutable array update at index
 */
export function arrayUpdateAt<T>(
  array: readonly T[],
  index: number,
  value: T
): T[] {
  if (index < 0 || index >= array.length) {
    return [...array];
  }
  const result = [...array];
  result[index] = value;
  return result;
}

/**
 * Immutable array insert at index
 */
export function arrayInsertAt<T>(
  array: readonly T[],
  index: number,
  ...items: T[]
): T[] {
  if (index < 0) {
    return [...items, ...array];
  }
  if (index >= array.length) {
    return [...array, ...items];
  }
  return [...array.slice(0, index), ...items, ...array.slice(index)];
}

/**
 * Immutable array move item from one index to another
 */
export function arrayMove<T>(
  array: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (
    fromIndex < 0 || 
    fromIndex >= array.length || 
    toIndex < 0 || 
    toIndex >= array.length ||
    fromIndex === toIndex
  ) {
    return [...array];
  }
  
  const result = [...array];
  const items = result.splice(fromIndex, 1);
  if (items.length > 0 && items[0] !== undefined) {
    result.splice(toIndex, 0, items[0]);
  }
  return result;
}

/**
 * Safe array access with default value
 */
export function arrayGet<T>(
  array: readonly T[] | null | undefined,
  index: number,
  defaultValue?: T
): T | undefined {
  if (!array || index < 0 || index >= array.length) {
    return defaultValue;
  }
  return array[index];
}

/**
 * Safe array first element
 */
export function arrayFirst<T>(
  array: readonly T[] | null | undefined,
  defaultValue?: T
): T | undefined {
  return arrayGet(array, 0, defaultValue);
}

/**
 * Safe array last element
 */
export function arrayLast<T>(
  array: readonly T[] | null | undefined,
  defaultValue?: T
): T | undefined {
  if (!array || array.length === 0) {
    return defaultValue;
  }
  return array[array.length - 1];
}

/**
 * Create unique array (remove duplicates)
 */
export function arrayUnique<T>(
  array: readonly T[]
): T[] {
  return [...new Set(array)];
}

/**
 * Create unique array by key
 */
export function arrayUniqueBy<T, K>(
  array: readonly T[],
  keyFn: (item: T) => K
): T[] {
  const seen = new Map<K, T>();
  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

/**
 * Safe array filter with type narrowing
 */
export function arrayFilter<T, S extends T>(
  array: readonly T[] | null | undefined,
  predicate: (value: T, index: number, array: readonly T[]) => value is S
): S[] {
  if (!array) return [];
  return array.filter(predicate);
}

/**
 * Safe array map
 */
export function arrayMap<T, R>(
  array: readonly T[] | null | undefined,
  mapper: (value: T, index: number, array: readonly T[]) => R
): R[] {
  if (!array) return [];
  return array.map(mapper);
}

/**
 * Safe array reduce
 */
export function arrayReduce<T, R>(
  array: readonly T[] | null | undefined,
  reducer: (accumulator: R, current: T, index: number, array: readonly T[]) => R,
  initialValue: R
): R {
  if (!array) return initialValue;
  return array.reduce(reducer, initialValue);
}

/**
 * Chunk array into smaller arrays
 */
export function arrayChunk<T>(
  array: readonly T[],
  size: number
): T[][] {
  if (size <= 0) return [];
  
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Flatten nested arrays (one level deep)
 */
export function arrayFlatten<T>(
  array: readonly (T | T[])[]
): T[] {
  return array.reduce<T[]>((acc, val) => {
    if (Array.isArray(val)) {
      return [...acc, ...val];
    }
    return [...acc, val];
  }, []);
}

/**
 * Deep flatten nested arrays
 */
export function arrayFlattenDeep<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  array: readonly any[]
): T[] {
  return array.reduce<T[]>((acc, val) => {
    if (Array.isArray(val)) {
      return [...acc, ...arrayFlattenDeep<T>(val)];
    }
    return [...acc, val];
  }, []);
}

/**
 * Group array items by key
 */
export function arrayGroupBy<T, K extends string | number | symbol>(
  array: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

/**
 * Sort array immutably
 */
export function arraySort<T>(
  array: readonly T[],
  compareFn?: (a: T, b: T) => number
): T[] {
  return [...array].sort(compareFn);
}

/**
 * Sort array by key immutably
 */
export function arraySortBy<T>(
  array: readonly T[],
  keyFn: (item: T) => string | number,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...array].sort((a, b) => {
    const aKey = keyFn(a);
    const bKey = keyFn(b);
    
    if (aKey < bKey) return order === 'asc' ? -1 : 1;
    if (aKey > bKey) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Check if arrays are equal (shallow)
 */
export function arrayEquals<T>(
  a: readonly T[] | null | undefined,
  b: readonly T[] | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  
  return a.every((val, index) => val === b[index]);
}

/**
 * Check if arrays are equal (deep)
 */
export function arrayDeepEquals<T>(
  a: readonly T[] | null | undefined,
  b: readonly T[] | null | undefined,
  compareFn: (a: T, b: T) => boolean = (x, y) => x === y
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  
  return a.every((val, index) => {
    const bVal = b[index];
    return bVal !== undefined && compareFn(val, bVal);
  });
}

/**
 * Array intersection
 */
export function arrayIntersection<T>(
  a: readonly T[],
  b: readonly T[]
): T[] {
  const bSet = new Set(b);
  return a.filter(x => bSet.has(x));
}

/**
 * Array difference (items in a but not in b)
 */
export function arrayDifference<T>(
  a: readonly T[],
  b: readonly T[]
): T[] {
  const bSet = new Set(b);
  return a.filter(x => !bSet.has(x));
}

/**
 * Array symmetric difference (items in either a or b but not both)
 */
export function arraySymmetricDifference<T>(
  a: readonly T[],
  b: readonly T[]
): T[] {
  const aSet = new Set(a);
  const bSet = new Set(b);
  return [
    ...a.filter(x => !bSet.has(x)),
    ...b.filter(x => !aSet.has(x))
  ];
}

/**
 * Type guard for non-nullable array items
 */
export function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Filter out null/undefined values
 */
export function arrayCompact<T>(
  array: readonly (T | null | undefined)[]
): T[] {
  return array.filter(isNotNull);
}

/**
 * Safe array includes check
 */
export function arrayIncludes<T>(
  array: readonly T[] | null | undefined,
  value: T
): boolean {
  return array ? array.includes(value) : false;
}

/**
 * Find index with safe handling
 */
export function arrayIndexOf<T>(
  array: readonly T[] | null | undefined,
  value: T
): number {
  return array ? array.indexOf(value) : -1;
}

/**
 * Safe array find
 */
export function arrayFind<T>(
  array: readonly T[] | null | undefined,
  predicate: (value: T, index: number, array: readonly T[]) => boolean
): T | undefined {
  return array ? array.find(predicate) : undefined;
}

/**
 * Safe array findIndex
 */
export function arrayFindIndex<T>(
  array: readonly T[] | null | undefined,
  predicate: (value: T, index: number, array: readonly T[]) => boolean
): number {
  return array ? array.findIndex(predicate) : -1;
}
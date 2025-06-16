// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    pathname: '/',
    query: {},
    asPath: '/',
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  useParams: () => ({
    id: '',
  }),
}));

// Mock useToast hook
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock Math.random for snapshot consistency if needed
// const mockMath = Object.create(global.Math);
// mockMath.random = () => 0.5;
// global.Math = mockMath;

// Silence console.error and console.warn during tests to keep output clean if necessary
// You might want to enable this selectively or ensure tests don't cause errors.
// beforeEach(() => {
//   jest.spyOn(console, 'error').mockImplementation(jest.fn());
//   jest.spyOn(console, 'warn').mockImplementation(jest.fn());
// });

import {
  isVehicleSummary,
  isVehicleSummaryArray,
  isTemplate,
  isTemplateArray,
  isPostingLimits,
  isExtensionAuthState,
  isValidFillPayload,
  isValidSaveTemplatePayload,
} from '../src/validators';

describe('validators', () => {
  describe('isVehicleSummaryArray', () => {
    it('should return true for valid vehicle array', () => {
      const vehicles = [
        {
          id: 1,
          make: 'Toyota',
          model: 'Camry',
          year: 2024,
          price: 25000,
          images: ['https://example.com/image.jpg'],
        },
      ];
      expect(isVehicleSummaryArray(vehicles)).toBe(true);
    });

    it('should return true for empty array', () => {
      expect(isVehicleSummaryArray([])).toBe(true);
    });

    it('should return false for non-array', () => {
      expect(isVehicleSummaryArray(null)).toBe(false);
      expect(isVehicleSummaryArray(undefined)).toBe(false);
      expect(isVehicleSummaryArray({})).toBe(false);
      expect(isVehicleSummaryArray('string')).toBe(false);
    });

    it('should return false if vehicle missing id', () => {
      const vehicles = [{ make: 'Toyota', model: 'Camry' }];
      expect(isVehicleSummaryArray(vehicles)).toBe(false);
    });

    it('should return false if images is not array', () => {
      const vehicles = [
        { id: 1, make: 'Toyota', model: 'Camry', images: 'not-array' },
      ];
      expect(isVehicleSummaryArray(vehicles)).toBe(false);
    });
  });

  describe('isTemplateArray', () => {
    it('should return true for valid template array', () => {
      const templates = [
        {
          id: 1,
          templateName: 'Default',
          titleTemplate: '{year} {make} {model}',
          descriptionTemplate: 'Great car!',
        },
      ];
      expect(isTemplateArray(templates)).toBe(true);
    });

    it('should return true for empty array', () => {
      expect(isTemplateArray([])).toBe(true);
    });

    it('should return false for non-array', () => {
      expect(isTemplateArray(null)).toBe(false);
      expect(isTemplateArray({})).toBe(false);
    });

    it('should return false if template missing required fields', () => {
      const templates = [{ id: 1 }];
      expect(isTemplateArray(templates)).toBe(false);
    });
  });

  describe('isPostingLimits', () => {
    it('should return true for valid limits', () => {
      const limits = {
        dailyLimit: 10,
        postsToday: 5,
        remaining: 5,
        postedVehicles: {
          facebook: [1, 2],
          kijiji: [],
          craigslist: [],
        },
      };
      expect(isPostingLimits(limits)).toBe(true);
    });

    it('should return false for missing fields', () => {
      expect(isPostingLimits({})).toBe(false);
      expect(isPostingLimits({ dailyLimit: 10 })).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isPostingLimits(null)).toBe(false);
      expect(isPostingLimits('string')).toBe(false);
    });
  });

  describe('isExtensionAuthState', () => {
    it('should return true for valid auth state', () => {
      const auth = {
        token: 'jwt-token',
        userId: 1,
        dealershipId: 1,
      };
      expect(isExtensionAuthState(auth)).toBe(true);
    });

    it('should return true with optional dealershipName', () => {
      const auth = {
        token: 'jwt-token',
        userId: 1,
        dealershipId: 1,
        dealershipName: 'Test Dealer',
        email: 'test@example.com',
        role: 'admin',
      };
      expect(isExtensionAuthState(auth)).toBe(true);
    });

    it('should return false for missing token', () => {
      const auth = {
        email: 'test@example.com',
        role: 'salesperson',
        dealershipId: 1,
      };
      expect(isExtensionAuthState(auth)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isExtensionAuthState(null)).toBe(false);
      expect(isExtensionAuthState('string')).toBe(false);
    });

    it('should return false for empty token', () => {
      const auth = {
        token: '',
        userId: 1,
        dealershipId: 1,
      };
      expect(isExtensionAuthState(auth)).toBe(false);
    });

    it('should return false for missing userId', () => {
      const auth = {
        token: 'jwt-token',
        dealershipId: 1,
      };
      expect(isExtensionAuthState(auth)).toBe(false);
    });

    it('should return false for missing dealershipId', () => {
      const auth = {
        token: 'jwt-token',
        userId: 1,
      };
      expect(isExtensionAuthState(auth)).toBe(false);
    });
  });

  describe('isVehicleSummary', () => {
    it('should return true for valid vehicle', () => {
      const vehicle = {
        id: 1,
        make: 'Toyota',
        model: 'Camry',
        year: 2024,
        images: ['https://example.com/image.jpg'],
      };
      expect(isVehicleSummary(vehicle)).toBe(true);
    });

    it('should return true with optional fields undefined', () => {
      const vehicle = {
        id: 1,
        make: undefined,
        model: undefined,
        year: undefined,
        images: [],
      };
      expect(isVehicleSummary(vehicle)).toBe(true);
    });

    it('should return true with optional fields null', () => {
      const vehicle = {
        id: 1,
        make: null,
        model: null,
        year: null,
        images: [],
      };
      expect(isVehicleSummary(vehicle)).toBe(true);
    });

    it('should return false for non-object', () => {
      expect(isVehicleSummary(null)).toBe(false);
      expect(isVehicleSummary(undefined)).toBe(false);
      expect(isVehicleSummary('string')).toBe(false);
      expect(isVehicleSummary(123)).toBe(false);
    });

    it('should return false for missing id', () => {
      const vehicle = { make: 'Toyota', images: [] };
      expect(isVehicleSummary(vehicle)).toBe(false);
    });

    it('should return false for non-number id', () => {
      const vehicle = { id: 'abc', images: [] };
      expect(isVehicleSummary(vehicle)).toBe(false);
    });
  });

  describe('isTemplate', () => {
    it('should return true for valid template', () => {
      const template = {
        id: 1,
        templateName: 'Default',
        titleTemplate: '{year} {make} {model}',
        descriptionTemplate: 'Great car!',
      };
      expect(isTemplate(template)).toBe(true);
    });

    it('should return false for non-object', () => {
      expect(isTemplate(null)).toBe(false);
      expect(isTemplate(undefined)).toBe(false);
      expect(isTemplate('string')).toBe(false);
    });

    it('should return false for missing templateName', () => {
      const template = {
        id: 1,
        titleTemplate: 'Title',
        descriptionTemplate: 'Desc',
      };
      expect(isTemplate(template)).toBe(false);
    });

    it('should return false for missing titleTemplate', () => {
      const template = {
        id: 1,
        templateName: 'Name',
        descriptionTemplate: 'Desc',
      };
      expect(isTemplate(template)).toBe(false);
    });

    it('should return false for missing descriptionTemplate', () => {
      const template = {
        id: 1,
        templateName: 'Name',
        titleTemplate: 'Title',
      };
      expect(isTemplate(template)).toBe(false);
    });

    it('should return false for non-string fields', () => {
      const template = {
        id: 1,
        templateName: 123,
        titleTemplate: 'Title',
        descriptionTemplate: 'Desc',
      };
      expect(isTemplate(template)).toBe(false);
    });
  });

  describe('isPostingLimits extended', () => {
    it('should return false for null postedVehicles', () => {
      const limits = {
        dailyLimit: 10,
        postsToday: 5,
        remaining: 5,
        postedVehicles: null,
      };
      expect(isPostingLimits(limits)).toBe(false);
    });

    it('should return false for non-number dailyLimit', () => {
      const limits = {
        dailyLimit: 'ten',
        postsToday: 5,
        remaining: 5,
        postedVehicles: {},
      };
      expect(isPostingLimits(limits)).toBe(false);
    });

    it('should return false for non-number postsToday', () => {
      const limits = {
        dailyLimit: 10,
        postsToday: 'five',
        remaining: 5,
        postedVehicles: {},
      };
      expect(isPostingLimits(limits)).toBe(false);
    });

    it('should return false for non-number remaining', () => {
      const limits = {
        dailyLimit: 10,
        postsToday: 5,
        remaining: 'five',
        postedVehicles: {},
      };
      expect(isPostingLimits(limits)).toBe(false);
    });
  });

  describe('isValidFillPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: { title: 'Test' },
      };
      expect(isValidFillPayload(payload)).toBe(true);
    });

    it('should return true with optional imageUrls', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: { title: 'Test' },
        imageUrls: ['https://example.com/image.jpg'],
      };
      expect(isValidFillPayload(payload)).toBe(true);
    });

    it('should return true with optional templateId', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: { title: 'Test' },
        templateId: 5,
      };
      expect(isValidFillPayload(payload)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidFillPayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidFillPayload(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidFillPayload('string')).toBe(false);
      expect(isValidFillPayload(123)).toBe(false);
      expect(isValidFillPayload([])).toBe(false);
    });

    it('should return false for missing platform', () => {
      const payload = {
        vehicleId: 1,
        formData: { title: 'Test' },
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });

    it('should return false for non-string platform', () => {
      const payload = {
        platform: 123,
        vehicleId: 1,
        formData: { title: 'Test' },
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });

    it('should return false for missing vehicleId', () => {
      const payload = {
        platform: 'facebook',
        formData: { title: 'Test' },
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });

    it('should return false for non-number vehicleId', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 'abc',
        formData: { title: 'Test' },
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });

    it('should return false for missing formData', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });

    it('should return false for null formData', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: null,
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });

    it('should return false for non-object formData', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: 'string',
      };
      expect(isValidFillPayload(payload)).toBe(false);
    });
  });

  describe('isValidSaveTemplatePayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        templateName: 'My Template',
        titleTemplate: '{year} {make} {model}',
        descriptionTemplate: 'Great car for sale!',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(true);
    });

    it('should return true with optional isShared', () => {
      const payload = {
        templateName: 'My Template',
        titleTemplate: '{year} {make} {model}',
        descriptionTemplate: 'Great car!',
        isShared: true,
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidSaveTemplatePayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidSaveTemplatePayload(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidSaveTemplatePayload('string')).toBe(false);
      expect(isValidSaveTemplatePayload(123)).toBe(false);
      expect(isValidSaveTemplatePayload([])).toBe(false);
    });

    it('should return false for missing templateName', () => {
      const payload = {
        titleTemplate: 'Title',
        descriptionTemplate: 'Desc',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });

    it('should return false for empty templateName', () => {
      const payload = {
        templateName: '   ',
        titleTemplate: 'Title',
        descriptionTemplate: 'Desc',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });

    it('should return false for non-string templateName', () => {
      const payload = {
        templateName: 123,
        titleTemplate: 'Title',
        descriptionTemplate: 'Desc',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });

    it('should return false for missing titleTemplate', () => {
      const payload = {
        templateName: 'Name',
        descriptionTemplate: 'Desc',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });

    it('should return false for empty titleTemplate', () => {
      const payload = {
        templateName: 'Name',
        titleTemplate: '   ',
        descriptionTemplate: 'Desc',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });

    it('should return false for missing descriptionTemplate', () => {
      const payload = {
        templateName: 'Name',
        titleTemplate: 'Title',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });

    it('should return false for empty descriptionTemplate', () => {
      const payload = {
        templateName: 'Name',
        titleTemplate: 'Title',
        descriptionTemplate: '   ',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(false);
    });
  });
});

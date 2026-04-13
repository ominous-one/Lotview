import {
  buildDealershipArtifactFileName,
  deriveDealershipOperatorLabel,
  normalizeDealershipReferenceValue,
  resolveDealershipReference,
} from '../dealership-reference';

describe('dealership-reference', () => {
  test('normalizes dealership-facing handles into safe lowercase labels', () => {
    expect(normalizeDealershipReferenceValue(' Olympic Hyundai ')).toBe('olympic-hyundai');
    expect(normalizeDealershipReferenceValue('OLYMPIC')).toBe('olympic');
    expect(normalizeDealershipReferenceValue('')).toBeNull();
  });

  test('prefers subdomain for operator-facing dealership labels', () => {
    expect(
      deriveDealershipOperatorLabel({
        id: 1,
        name: 'Olympic Hyundai Vancouver',
        slug: 'olympic-hyundai',
        subdomain: 'olympic',
      }),
    ).toBe('olympic');
  });

  test('builds human-readable artifact filenames', () => {
    expect(
      buildDealershipArtifactFileName('db certification', {
        id: 1,
        name: 'Olympic Hyundai Vancouver',
        slug: 'olympic-hyundai',
        subdomain: 'olympic',
      }),
    ).toBe('db-certification-olympic.json');
  });

  test('resolves dealership references by subdomain, slug, or numeric id', async () => {
    const dealership = {
      id: 1,
      name: 'Olympic Hyundai Vancouver',
      slug: 'olympic-hyundai',
      subdomain: 'olympic',
    };
    const lookup = {
      getDealership: jest.fn(async (id: number) => (id === 1 ? dealership : undefined)),
      getDealershipBySlug: jest.fn(async (slug: string) => (slug === 'olympic-hyundai' ? dealership : undefined)),
      getDealershipBySubdomain: jest.fn(async (subdomain: string) => (subdomain === 'olympic' ? dealership : undefined)),
    };

    await expect(resolveDealershipReference(lookup, 'olympic')).resolves.toEqual(dealership);
    await expect(resolveDealershipReference(lookup, 'olympic-hyundai')).resolves.toEqual(dealership);
    await expect(resolveDealershipReference(lookup, '1')).resolves.toEqual(dealership);
  });
});

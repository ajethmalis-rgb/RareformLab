import { describe, it, expect } from 'vitest';
import { VEHICLES, LIBRARY_STATS, byId } from '@/data/vehicles';
import { ORIGINAL_FACES, REFERENCE_FACES, ALL_FACES } from '@/data/faces';
import { OUTER_LIPS, INNER_BARRELS, COMPLETE_SHELLS } from '@/data/components';
import { isKnown } from '@/engine/types';

/**
 * Library invariants.
 *
 * The first group asserts the counts the README quotes, so the document
 * cannot silently drift from the data. The rest guard the honesty
 * properties: a catalogue entry must not acquire geometry by accident,
 * and a reference face must not become configurable.
 */
describe('README counts', () => {
  it('matches the stated library size', () => {
    const s = LIBRARY_STATS();
    expect(s.total).toBe(47);
    expect(VEHICLES.filter(v => v.make === 'BMW')).toHaveLength(19);
    expect(VEHICLES.filter(v => v.make === 'Mercedes-Benz')).toHaveLength(14);
    expect(VEHICLES.filter(v => v.make === 'Porsche')).toHaveLength(14);
    expect(s.illustrative).toBe(1);
    expect(s.verified).toBe(0); // no real car is verified, and saying so matters
    expect(s.catalogOnly).toBe(46);
  });

  it('matches the stated face and component counts', () => {
    expect(ORIGINAL_FACES).toHaveLength(7);
    expect(REFERENCE_FACES).toHaveLength(39);
    expect(OUTER_LIPS).toHaveLength(96);
    expect(INNER_BARRELS).toHaveLength(108);
    expect(COMPLETE_SHELLS).toHaveLength(132);
  });
});

describe('honesty invariants', () => {
  it('gives catalogue-only entries no geometry at all', () => {
    for (const v of VEHICLES.filter(x => x.assetState === 'catalog_entry_only')) {
      for (const corner of [v.front, v.rear]) {
        expect(isKnown(corner!.archRadiusMm)).toBe(false);
        expect(isKnown(corner!.archLateralMm)).toBe(false);
        expect(isKnown(corner!.wellCeilingMm)).toBe(false);
        expect(corner!.inner).toHaveLength(0);
      }
      expect(v.notes.join(' ')).toMatch(/Catalogue entry only/i);
    }
  });

  it('never grades an illustrative envelope above estimated', () => {
    for (const v of VEHICLES.filter(x => x.assetState === 'illustrative_only')) {
      for (const corner of [v.front, v.rear]) {
        expect(corner!.archRadiusMm.grade).toBe('estimated');
        expect(corner!.archLateralMm.grade).toBe('estimated');
      }
    }
  });

  it('leaves the caliper envelope unknown everywhere, since none is measured', () => {
    for (const v of VEHICLES) {
      for (const corner of [v.front, v.rear]) {
        expect(isKnown(corner!.brake.caliperRadialMm)).toBe(false);
      }
    }
  });

  it('keeps every reference face non-configurable and asset-free', () => {
    for (const f of REFERENCE_FACES) {
      expect(f.configurable).toBe(false);
      expect(f.design).toBeUndefined();
      expect(f.rights).toMatch(/Reference entry only/i);
    }
    for (const f of ORIGINAL_FACES) {
      expect(f.configurable).toBe(true);
      expect(f.design).toBeDefined();
    }
  });

  it('has no duplicate ids', () => {
    const vids = VEHICLES.map(v => v.id);
    expect(new Set(vids).size).toBe(vids.length);
    const fids = ALL_FACES.map(f => f.id);
    expect(new Set(fids).size).toBe(fids.length);
  });

  it('resolves every vehicle by id', () => {
    for (const v of VEHICLES) expect(byId(v.id)?.id).toBe(v.id);
  });
});

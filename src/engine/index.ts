/**
 * RAREFORM FITMENT LAB — deterministic geometry engine.
 *
 * This module is pure TypeScript with no dependency on React, Three.js,
 * the DOM, the network or any language model. Every number the product
 * displays comes from here, which is what makes the results
 * reproducible and testable. Read units.ts first: it defines the
 * coordinate frame and the reference planes everything else assumes.
 */
export * from './units';
export * from './types';
export * from './wheel';
export * from './tire';
export * from './kinematics';
export * from './collision';
export * from './optimizer';

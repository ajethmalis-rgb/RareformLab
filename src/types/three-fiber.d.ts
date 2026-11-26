/**
 * React Three Fiber declares its JSX.IntrinsicElements augmentation inside
 * its own module, so the augmentation only applies once the module is in
 * the type graph. A component that renders <mesh> without importing
 * anything from the package would otherwise fail to typecheck. This
 * reference pulls it in project-wide.
 */
/// <reference types="@react-three/fiber" />

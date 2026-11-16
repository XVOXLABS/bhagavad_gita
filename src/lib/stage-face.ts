/** Size of the stage pose images in public/gitalens. */
export const PLATE_SIZE = { width: 1620, height: 924 } as const;

/**
 * Where the square image of the Anam avatar sits in the "welcome" pose image, in that image's pixels.
 * Measured by matching Anam's processed source image against the pose; it may extend past the edges.
 */
export const FACE_SOURCE = { x: 300, y: -22, size: 974 } as const;

export type Rect = { left: number; top: number; width: number; height: number };

type Size = { width: number; height: number };

/**
 * Where the live face video should go on screen so it lands exactly over the still Krishna.
 * `box` is the element the image covers, `position` its CSS object-position as fractions (0..1).
 * Anam streams a centred landscape crop of the square: its full width and the middle two-thirds.
 */
export function faceRect(
  box: Size,
  position: { x: number; y: number },
  image: Size = PLATE_SIZE,
  source: { x: number; y: number; size: number } = FACE_SOURCE,
): Rect {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const offsetX = (box.width - image.width * scale) * position.x;
  const offsetY = (box.height - image.height * scale) * position.y;
  return {
    left: offsetX + source.x * scale,
    top: offsetY + (source.y + source.size / 6) * scale,
    width: source.size * scale,
    height: ((source.size * 2) / 3) * scale,
  };
}

/** Reads a CSS object-position value such as "34% 50%" into fractions; anything else is centred. */
export function parseObjectPosition(value: string): { x: number; y: number } {
  const parts = value.trim().split(/\s+/);
  const read = (part: string | undefined) => {
    if (part === 'left' || part === 'top') return 0;
    if (part === 'right' || part === 'bottom') return 1;
    const match = part ? /^(-?\d+(?:\.\d+)?)(%|px)?$/.exec(part) : null;
    if (!match) return 0.5;
    if (match[2] === '%') return Number(match[1]) / 100;
    // A length of zero is the start edge; other lengths are not used on the stage.
    return Number(match[1]) === 0 ? 0 : 0.5;
  };
  return { x: read(parts[0]), y: read(parts[1]) };
}

export interface ISize {
  width: number;
  height: number;
}

/**
 * Largest size with the content's aspect ratio that fits inside the box
 * (CSS `object-fit: contain`): the limiting side is whichever of the box's
 * dimensions is smaller relative to the content.
 */
export const fitToBox = (content: ISize, box: ISize): ISize => {
  if (
    content.width <= 0 ||
    content.height <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return { width: content.width * scale, height: content.height * scale };
};

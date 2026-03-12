import type { Drawable } from "../types/domain";

export interface TacticalFrameOptions {
  width: number;
  height: number;
  courtType: "full" | "half";
  drawables: Drawable[];
}

const DASH_LENGTH = 16;
const DASH_GAP = 10;

export function drawTacticalFrame(
  context: CanvasRenderingContext2D,
  { width, height, courtType, drawables }: TacticalFrameOptions
): void {
  context.clearRect(0, 0, width, height);
  drawPitchBackground(context, width, height);
  drawCourt(context, width, height, courtType);
  drawDrawables(context, drawables);
}

function drawPitchBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  context.fillStyle = "#bf6e2b";
  context.fillRect(0, 0, width, height);
}

function drawCourt(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  courtType: "full" | "half"
): void {
  if (courtType === "half") {
    drawHalfCourt(context, width, height);
    return;
  }
  drawFullCourt(context, width, height);
}

function drawFullCourt(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const margin = Math.min(width, height) * 0.045;
  const left = margin;
  const top = margin;
  const right = width - margin;
  const bottom = height - margin;
  const lineColor = "#0b1020";
  const unit = Math.min((right - left) / 40, (bottom - top) / 20);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const centerRadius = 3 * unit;
  const penaltyRadius = 6 * unit;
  const penaltyDist = 6 * unit;
  const secondPenaltyDist = 10 * unit;
  const goalDepth = 1 * unit;
  const goalWidth = 3 * unit;
  const cornerRadius = Math.max(2, 0.25 * unit);
  const topPostY = centerY - goalWidth * 0.5;
  const bottomPostY = centerY + goalWidth * 0.5;
  const penaltyJoinHalf = 1.58 * unit;
  const penaltyJoinTop = centerY - penaltyJoinHalf;
  const penaltyJoinBottom = centerY + penaltyJoinHalf;

  context.fillStyle = "#1388b8";
  context.fillRect(left, top, right - left, bottom - top);

  strokeRect(context, left, top, right - left, bottom - top, lineColor, 2);
  drawLine(context, centerX, top, centerX, bottom, lineColor, 2, false);

  fillCircle(context, centerX, centerY, 3, lineColor);
  context.strokeStyle = lineColor;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  context.stroke();

  drawFutsalPenaltyArea(context, {
    side: "left",
    left,
    right,
    top,
    bottom,
    unit,
    lineColor
  });
  drawFutsalPenaltyArea(context, {
    side: "right",
    left,
    right,
    top,
    bottom,
    unit,
    lineColor
  });

  const leftPenaltyX = left + penaltyDist;
  const rightPenaltyX = right - penaltyDist;
  const leftSecondPenaltyX = left + secondPenaltyDist;
  const rightSecondPenaltyX = right - secondPenaltyDist;
  fillCircle(context, leftPenaltyX, centerY, 4, lineColor);
  fillCircle(context, rightPenaltyX, centerY, 4, lineColor);
  fillCircle(context, leftSecondPenaltyX, centerY, 4, lineColor);
  fillCircle(context, rightSecondPenaltyX, centerY, 4, lineColor);

  strokeRect(context, left - goalDepth, centerY - goalWidth * 0.5, goalDepth, goalWidth, lineColor, 2);
  strokeRect(context, right, centerY - goalWidth * 0.5, goalDepth, goalWidth, lineColor, 2);

  drawArc(context, left, top, cornerRadius, 0, 90, lineColor, 2);
  drawArc(context, left, bottom, cornerRadius, -90, 0, lineColor, 2);
  drawArc(context, right, top, cornerRadius, 90, 180, lineColor, 2);
  drawArc(context, right, bottom, cornerRadius, 180, 270, lineColor, 2);

  drawLine(
    context,
    left + penaltyDist,
    penaltyJoinTop,
    left + penaltyDist,
    penaltyJoinBottom,
    lineColor,
    2,
    false
  );
  drawLine(
    context,
    right - penaltyDist,
    penaltyJoinTop,
    right - penaltyDist,
    penaltyJoinBottom,
    lineColor,
    2,
    false
  );

  drawSubstitutionMarks(context, left, right, top, bottom, unit, lineColor);
  drawTouchlineDistanceMarks(context, left, right, top, bottom, unit, lineColor);
}

function drawHalfCourt(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const margin = Math.min(width, height) * 0.045;
  const left = margin;
  const top = margin;
  const right = width - margin;
  const bottom = height - margin;
  const lineColor = "#0b1020";
  const unit = Math.min((right - left) / 20, (bottom - top) / 20);
  const centerX = width * 0.5;
  const centerY = top + (bottom - top) * 0.5;
  const goalWidth = 3 * unit;
  const goalDepth = 1 * unit;
  const penaltyRadius = 6 * unit;
  const penaltyDist = 6 * unit;
  const penaltyJoinHalf = 1.58 * unit;
  const penaltyJoinLeft = centerX - penaltyJoinHalf;
  const penaltyJoinRight = centerX + penaltyJoinHalf;

  context.fillStyle = "#1388b8";
  context.fillRect(left, top, right - left, bottom - top);

  strokeRect(context, left, top, right - left, bottom - top, lineColor, 2);

  const halfLineY = bottom - 0.5 * unit;
  drawLine(context, left, halfLineY, right, halfLineY, lineColor, 2, false);

  const goalTop = centerY - goalWidth * 0.5;
  drawLine(
    context,
    centerX - goalWidth * 0.5,
    top - 6,
    centerX + goalWidth * 0.5,
    top - 6,
    lineColor,
    2,
    false
  );
  strokeRect(
    context,
    centerX - goalWidth * 0.5,
    top - goalDepth,
    goalWidth,
    goalDepth,
    lineColor,
    2
  );

  const leftPostX = centerX - goalWidth * 0.5;
  const rightPostX = centerX + goalWidth * 0.5;
  const leftJoinAngle = (Math.atan2(penaltyDist, penaltyJoinLeft - leftPostX) * 180) / Math.PI;
  const rightJoinAngle = (Math.atan2(penaltyDist, penaltyJoinRight - rightPostX) * 180) / Math.PI;
  drawArc(context, leftPostX, top, penaltyRadius, 180, leftJoinAngle, lineColor, 2);
  drawArc(context, rightPostX, top, penaltyRadius, rightJoinAngle, 0, lineColor, 2);
  drawLine(
    context,
    penaltyJoinLeft,
    top + penaltyDist,
    penaltyJoinRight,
    top + penaltyDist,
    lineColor,
    2,
    false
  );

  fillCircle(context, centerX, top + penaltyDist, 4, lineColor);
  fillCircle(context, centerX, top + 10 * unit, 4, lineColor);

  drawArc(context, centerX, halfLineY, 3 * unit, 180, 360, lineColor, 2);

  const cornerRadius = Math.max(2, 0.25 * unit);
  drawArc(context, left, top, cornerRadius, 0, 90, lineColor, 2);
  drawArc(context, right, top, cornerRadius, 90, 180, lineColor, 2);
}

interface FutsalEndArgs {
  side: "left" | "right";
  left: number;
  right: number;
  top: number;
  bottom: number;
  unit: number;
  lineColor: string;
}

function drawFutsalPenaltyArea(context: CanvasRenderingContext2D, args: FutsalEndArgs): void {
  const { side, left, right, top, bottom, unit, lineColor } = args;
  const centerY = (top + bottom) * 0.5;
  const goalWidth = 3 * unit;
  const penaltyRadius = 6 * unit;
  const penaltyDist = 6 * unit;
  const topPostY = centerY - goalWidth * 0.5;
  const bottomPostY = centerY + goalWidth * 0.5;
  const penaltyJoinHalf = 1.58 * unit;
  const penaltyJoinTop = centerY - penaltyJoinHalf;
  const penaltyJoinBottom = centerY + penaltyJoinHalf;
  if (side === "left") {
    const topJoinAngle = (Math.atan2(penaltyJoinTop - topPostY, penaltyDist) * 180) / Math.PI;
    const bottomJoinAngle = (Math.atan2(penaltyJoinBottom - bottomPostY, penaltyDist) * 180) / Math.PI;
    drawArc(context, left, topPostY, penaltyRadius, -90, topJoinAngle, lineColor, 2);
    drawArc(context, left, bottomPostY, penaltyRadius, bottomJoinAngle, 90, lineColor, 2);
    return;
  }
  const topJoinAngle = (Math.atan2(penaltyJoinTop - topPostY, -penaltyDist) * 180) / Math.PI;
  const bottomJoinAngle = (Math.atan2(penaltyJoinBottom - bottomPostY, -penaltyDist) * 180) / Math.PI;
  drawArc(context, right, topPostY, penaltyRadius, -90, topJoinAngle, lineColor, 2);
  drawArc(context, right, bottomPostY, penaltyRadius, 90, bottomJoinAngle, lineColor, 2);
}

function drawSubstitutionMarks(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  bottom: number,
  unit: number,
  lineColor: string
): void {
  const centerX = (left + right) * 0.5;
  const markLength = Math.max(8, 0.8 * unit);
  const marks = [centerX - 10 * unit, centerX - 5 * unit, centerX + 5 * unit, centerX + 10 * unit];
  for (const markX of marks) {
    drawLine(
      context,
      markX,
      bottom - markLength * 0.4,
      markX,
      bottom + markLength,
      lineColor,
      2,
      false
    );
  }
}

function drawTouchlineDistanceMarks(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  bottom: number,
  unit: number,
  lineColor: string
): void {
  const offset = 5 * unit;
  const markLength = Math.max(8, 0.6 * unit);
  const marksY = [top + offset, bottom - offset];
  for (const markY of marksY) {
    drawLine(context, left - markLength * 0.5, markY, left + markLength, markY, lineColor, 2, false);
    drawLine(context, right - markLength, markY, right + markLength * 0.5, markY, lineColor, 2, false);
  }
}

function drawDrawables(context: CanvasRenderingContext2D, drawables: Drawable[]): void {
  for (const drawable of drawables) {
    switch (drawable.type) {
      case "zone":
        drawZone(context, drawable);
        break;
      case "line":
        drawConnection(context, drawable, false);
        break;
      case "arrow":
        drawConnection(context, drawable, true);
        break;
      case "label":
        drawLabelTag(context, drawable);
        break;
      case "cone":
        drawCone(context, drawable);
        break;
      case "ball":
        drawBall(context, drawable);
        break;
      case "goalkeeper":
        drawPlayer(context, drawable, true);
        break;
      case "player":
      default:
        drawPlayer(context, drawable, false);
        break;
    }
  }
}

function drawZone(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 120);
  const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 70);
  const left = Math.min(drawable.x, endX);
  const top = Math.min(drawable.y, endY);
  const width = Math.abs(endX - drawable.x);
  const height = Math.abs(endY - drawable.y);

  context.fillStyle = toRgba(drawable.style.fill, drawable.style.opacity);
  context.fillRect(left, top, width, height);
  strokeRect(
    context,
    left,
    top,
    width,
    height,
    toRgba(drawable.style.stroke, drawable.style.opacity),
    drawable.style.strokeWidth
  );

  if (drawable.label) {
    context.fillStyle = contrastColor(drawable.style.fill);
    context.font = "600 12px 'Source Sans 3', sans-serif";
    context.fillText(drawable.label, left + 6, top + 16);
  }
}

function drawConnection(
  context: CanvasRenderingContext2D,
  drawable: Drawable,
  withArrowHead: boolean
): void {
  const startX = drawable.x;
  const startY = drawable.y;
  const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
  const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);

  drawLine(
    context,
    startX,
    startY,
    endX,
    endY,
    toRgba(drawable.style.stroke, drawable.style.opacity),
    drawable.style.strokeWidth,
    Boolean(drawable.style.dashed)
  );

  if (withArrowHead) {
    drawArrowHead(
      context,
      startX,
      startY,
      endX,
      endY,
      toRgba(drawable.style.stroke, drawable.style.opacity),
      drawable.style.strokeWidth
    );
  }

  if (drawable.label) {
    context.fillStyle = toRgba(drawable.style.stroke, drawable.style.opacity);
    context.font = "600 11px 'Source Sans 3', sans-serif";
    context.fillText(drawable.label, (startX + endX) * 0.5, (startY + endY) * 0.5 - 4);
  }
}

function drawPlayer(
  context: CanvasRenderingContext2D,
  drawable: Drawable,
  isGoalkeeper: boolean
): void {
  const radius = Math.max((drawable.width ?? 28) * 0.5, 10);
  const fill = isGoalkeeper ? blendHex(drawable.style.fill, "#ef476f", 0.35) : drawable.style.fill;

  fillCircle(context, drawable.x, drawable.y, radius, toRgba(fill, drawable.style.opacity));
  const outlinePasses = Math.max(1, Math.round(drawable.style.strokeWidth));
  for (let offset = 0; offset < outlinePasses; offset += 1) {
    strokeCircle(
      context,
      drawable.x,
      drawable.y,
      radius + offset,
      toRgba(drawable.style.stroke, drawable.style.opacity),
      1
    );
  }

  const markerEndX = drawable.x + Math.cos((drawable.rotation * Math.PI) / 180) * radius;
  const markerEndY = drawable.y + Math.sin((drawable.rotation * Math.PI) / 180) * radius;
  drawLine(
    context,
    drawable.x,
    drawable.y,
    markerEndX,
    markerEndY,
    toRgba(drawable.style.stroke, drawable.style.opacity),
    1,
    false
  );

  if (drawable.label) {
    context.fillStyle = contrastColor(fill);
    context.font = "700 12px 'Source Sans 3', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(drawable.label, drawable.x, drawable.y);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }
}

function drawBall(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const radius = Math.max((drawable.width ?? 12) * 0.5, 5);
  fillCircle(
    context,
    drawable.x,
    drawable.y,
    radius,
    toRgba(drawable.style.fill, drawable.style.opacity)
  );
  strokeCircle(
    context,
    drawable.x,
    drawable.y,
    radius,
    toRgba(drawable.style.stroke, drawable.style.opacity),
    drawable.style.strokeWidth
  );
  fillCircle(
    context,
    drawable.x,
    drawable.y,
    Math.max(radius * 0.35, 1),
    toRgba(drawable.style.stroke, drawable.style.opacity)
  );
}

function drawCone(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const size = Math.max(drawable.width ?? 10, drawable.height ?? 10, 10);
  const left = drawable.x - size * 0.5;
  const top = drawable.y - size * 0.5;

  context.fillStyle = toRgba(drawable.style.fill, drawable.style.opacity);
  context.fillRect(left, top, size, size);
  strokeRect(
    context,
    left,
    top,
    size,
    size,
    toRgba(drawable.style.stroke, drawable.style.opacity),
    drawable.style.strokeWidth
  );
}

function drawLabelTag(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const text = drawable.label?.trim() || "Label";
  context.font = "600 12px 'Source Sans 3', sans-serif";
  const metrics = context.measureText(text);
  const width = metrics.width + 12;
  const height = 22;

  context.fillStyle = toRgba(drawable.style.fill, drawable.style.opacity);
  context.fillRect(drawable.x, drawable.y, width, height);
  strokeRect(
    context,
    drawable.x,
    drawable.y,
    width,
    height,
    toRgba(drawable.style.stroke, drawable.style.opacity),
    drawable.style.strokeWidth
  );

  context.fillStyle = contrastColor(drawable.style.fill);
  context.fillText(text, drawable.x + 6, drawable.y + 15);
}

function drawLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  thickness: number,
  dashed: boolean
): void {
  if (dashed) {
    drawDashedLine(context, startX, startY, endX, endY, color, thickness);
    return;
  }
  drawSolidThickLine(context, startX, startY, endX, endY, color, thickness);
}

function drawDashedLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  thickness: number
): void {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  if (distance <= Number.EPSILON) {
    return;
  }

  let cursor = 0;
  while (cursor < distance) {
    const segStart = cursor;
    const segEnd = Math.min(cursor + DASH_LENGTH, distance);
    const t0 = segStart / distance;
    const t1 = segEnd / distance;
    drawSolidThickLine(
      context,
      startX + dx * t0,
      startY + dy * t0,
      startX + dx * t1,
      startY + dy * t1,
      color,
      thickness
    );
    cursor += DASH_LENGTH + DASH_GAP;
  }
}

function drawSolidThickLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  thickness: number
): void {
  const drawWidth = Math.max(1, Math.round(thickness));
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);

  if (length <= Number.EPSILON) {
    fillCircle(context, startX, startY, Math.max(1, drawWidth * 0.5), color);
    return;
  }

  const normalX = -dy / length;
  const normalY = dx / length;
  const firstOffset = -((drawWidth - 1) * 0.5);

  for (let pass = 0; pass < drawWidth; pass += 1) {
    const offset = firstOffset + pass;
    const shiftedStartX = startX + normalX * offset;
    const shiftedStartY = startY + normalY * offset;
    const shiftedEndX = endX + normalX * offset;
    const shiftedEndY = endY + normalY * offset;

    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(shiftedStartX, shiftedStartY);
    context.lineTo(shiftedEndX, shiftedEndY);
    context.stroke();
    context.restore();
  }
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  thickness: number
): void {
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 12 + thickness * 1.4;
  const spread = (28 * Math.PI) / 180;

  const leftX = endX - headLength * Math.cos(angle - spread);
  const leftY = endY - headLength * Math.sin(angle - spread);
  const rightX = endX - headLength * Math.cos(angle + spread);
  const rightY = endY - headLength * Math.sin(angle + spread);

  drawLine(context, endX, endY, leftX, leftY, color, Math.max(1, thickness), false);
  drawLine(context, endX, endY, rightX, rightY, color, Math.max(1, thickness), false);
}

function drawArc(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  startDegrees: number,
  endDegrees: number,
  color: string,
  thickness: number
): void {
  const sweep = Math.max(1, Math.abs(endDegrees - startDegrees));
  const steps = Math.ceil(sweep * 2);

  for (let segment = 0; segment < steps; segment += 1) {
    const t0 = segment / steps;
    const t1 = (segment + 1) / steps;
    const angle0 = ((startDegrees + (endDegrees - startDegrees) * t0) * Math.PI) / 180;
    const angle1 = ((startDegrees + (endDegrees - startDegrees) * t1) * Math.PI) / 180;
    const p0x = centerX + radius * Math.cos(angle0);
    const p0y = centerY + radius * Math.sin(angle0);
    const p1x = centerX + radius * Math.cos(angle1);
    const p1y = centerY + radius * Math.sin(angle1);
    drawLine(context, p0x, p0y, p1x, p1y, color, thickness, false);
  }
}

function strokeRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  thickness: number
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, thickness);
  context.strokeRect(x, y, width, height);
  context.restore();
}

function fillCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function strokeCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  thickness: number
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, thickness);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function toRgba(color: string, opacity: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return color;
  }
  const alpha = clamp(opacity, 0, 1);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function hexToRgb(value: string): [number, number, number] | null {
  const normalized = value.trim().replace("#", "");
  if (normalized.length !== 6) {
    return null;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return null;
  }

  return [red, green, blue];
}

function contrastColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return "#111827";
  }

  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luma > 142 ? "#101828" : "#f5f7fb";
}

function blendHex(left: string, right: string, t: number): string {
  const rgbLeft = hexToRgb(left);
  const rgbRight = hexToRgb(right);
  if (!rgbLeft || !rgbRight) {
    return t < 0.5 ? left : right;
  }
  const mix = (a: number, b: number) => Math.round(a + (b - a) * clamp(t, 0, 1));
  return `#${toHex(mix(rgbLeft[0], rgbRight[0]))}${toHex(mix(rgbLeft[1], rgbRight[1]))}${toHex(
    mix(rgbLeft[2], rgbRight[2])
  )}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

import type { CourtType, Drawable } from "../types/domain";

interface TacticalFrameOptions {
  width: number;
  height: number;
  courtType: CourtType | "half";
  drawables: Drawable[];
}

export interface RenderViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FramePoint {
  x: number;
  y: number;
}

export interface CourtRenderMapping {
  frameWidth: number;
  frameHeight: number;
  contentRect: RenderViewport;
  frameToWorld: (point: FramePoint) => FramePoint;
  worldToFrame: (point: FramePoint) => FramePoint;
  applyToContext: (context: CanvasRenderingContext2D) => void;
}

const DASH_LENGTH = 16;
const DASH_GAP = 10;
const RUNOFF_COLOR = "#a45f28";
const SURFACE_COLOR = "#1388b8";
const LINE_COLOR = "#f8fcff";
const LOGICAL_WIDTH = 1000;
const LOGICAL_HEIGHT = 500;
const HALF_FRAME_WIDTH = 980;
const HALF_FRAME_HEIGHT = 1040;
const PLAYER_DIAMETER = 24;
const BALL_DIAMETER = 12;
const CONE_DIAMETER = 14;
const DRIBBLE_STROKE = "#f4d35e";

export function drawTacticalFrame(
  context: CanvasRenderingContext2D,
  { width, height, courtType, drawables }: TacticalFrameOptions
): void {
  const normalizedCourtType = normalizeCourtType(courtType);
  const mapping = resolveCourtRenderMapping(normalizedCourtType, width, height);

  context.clearRect(0, 0, width, height);
  context.fillStyle = RUNOFF_COLOR;
  context.fillRect(0, 0, width, height);

  context.save();
  context.beginPath();
  context.rect(mapping.contentRect.x, mapping.contentRect.y, mapping.contentRect.width, mapping.contentRect.height);
  context.clip();
  mapping.applyToContext(context);
  drawPitchBackground(context, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawFullCourt(context, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawDrawables(context, drawables);
  context.restore();
}

export function resolveCanvasFrameSize(courtType: CourtType | "half" | undefined): { width: number; height: number } {
  return normalizeCourtType(courtType) === "full"
    ? { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT }
    : { width: HALF_FRAME_WIDTH, height: HALF_FRAME_HEIGHT };
}

export function resolveCourtRenderMapping(
  courtType: CourtType | "half" | undefined,
  frameWidth: number,
  frameHeight: number
): CourtRenderMapping {
  const normalizedCourtType = normalizeCourtType(courtType);
  const viewport = resolveWorldViewport(normalizedCourtType);
  const contentRect =
    normalizedCourtType === "full"
      ? { x: 0, y: 0, width: frameWidth, height: frameHeight }
      : resolveFocusContentRect(frameWidth, frameHeight);
  const scaleX = contentRect.width / viewport.width;
  const scaleY = contentRect.height / viewport.height;

  return {
    frameWidth,
    frameHeight,
    contentRect,
    frameToWorld: (point) => ({
      x: clamp(viewport.x + (point.x - contentRect.x) / scaleX, 0, LOGICAL_WIDTH),
      y: clamp(viewport.y + (point.y - contentRect.y) / scaleY, 0, LOGICAL_HEIGHT)
    }),
    worldToFrame: (point) => ({
      x: contentRect.x + (point.x - viewport.x) * scaleX,
      y: contentRect.y + (point.y - viewport.y) * scaleY
    }),
    applyToContext: (context) => {
      context.transform(scaleX, 0, 0, scaleY, contentRect.x - viewport.x * scaleX, contentRect.y - viewport.y * scaleY);
    }
  };
}

function normalizeCourtType(courtType: CourtType | "half" | undefined): CourtType {
  switch (courtType) {
    case "half":
    case "half-attacking":
      return "half-attacking";
    case "half-defending":
      return "half-defending";
    case "full":
    default:
      return "full";
  }
}

function drawPitchBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = RUNOFF_COLOR;
  context.fillRect(0, 0, width, height);
}

function resolveWorldViewport(courtType: CourtType): RenderViewport {
  if (courtType === "half-attacking") {
    return {
      x: LOGICAL_WIDTH * 0.5,
      y: 0,
      width: LOGICAL_WIDTH * 0.5,
      height: LOGICAL_HEIGHT
    };
  }

  if (courtType === "half-defending") {
    return {
      x: 0,
      y: 0,
      width: LOGICAL_WIDTH * 0.5,
      height: LOGICAL_HEIGHT
    };
  }

  return {
    x: 0,
    y: 0,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT
  };
}

function resolveFocusContentRect(frameWidth: number, frameHeight: number): RenderViewport {
  const squareSize = Math.min(frameWidth, frameHeight);
  return {
    x: (frameWidth - squareSize) * 0.5,
    y: (frameHeight - squareSize) * 0.5,
    width: squareSize,
    height: squareSize
  };
}

function drawFullCourt(context: CanvasRenderingContext2D, width: number, height: number): void {
  const margin = Math.min(width, height) * 0.03;
  const left = margin;
  const top = margin;
  const right = width - margin;
  const bottom = height - margin;
  const unit = Math.min((right - left) / 40, (bottom - top) / 20);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const centerRadius = 3 * unit;
  const penaltyDist = 6 * unit;
  const secondPenaltyDist = 10 * unit;
  const goalDepth = 1 * unit;
  const goalWidth = 3 * unit;
  const cornerRadius = Math.max(2, 0.25 * unit);
  context.fillStyle = SURFACE_COLOR;
  context.fillRect(left, top, right - left, bottom - top);

  strokeRect(context, left, top, right - left, bottom - top, LINE_COLOR, 2);
  drawLine(context, centerX, top, centerX, bottom, LINE_COLOR, 2, false);

  fillCircle(context, centerX, centerY, 3, LINE_COLOR);
  context.strokeStyle = LINE_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  context.stroke();

  drawFutsalPenaltyArea(context, { side: "left", left, right, top, bottom, unit, lineColor: LINE_COLOR });
  drawFutsalPenaltyArea(context, { side: "right", left, right, top, bottom, unit, lineColor: LINE_COLOR });

  fillCircle(context, left + penaltyDist, centerY, 4, LINE_COLOR);
  fillCircle(context, right - penaltyDist, centerY, 4, LINE_COLOR);
  fillCircle(context, left + secondPenaltyDist, centerY, 4, LINE_COLOR);
  fillCircle(context, right - secondPenaltyDist, centerY, 4, LINE_COLOR);

  strokeRect(context, left - goalDepth, centerY - goalWidth * 0.5, goalDepth, goalWidth, LINE_COLOR, 2);
  strokeRect(context, right, centerY - goalWidth * 0.5, goalDepth, goalWidth, LINE_COLOR, 2);

  drawArc(context, left, top, cornerRadius, 0, 90, LINE_COLOR, 2);
  drawArc(context, left, bottom, cornerRadius, -90, 0, LINE_COLOR, 2);
  drawArc(context, right, top, cornerRadius, 90, 180, LINE_COLOR, 2);
  drawArc(context, right, bottom, cornerRadius, 180, 270, LINE_COLOR, 2);

  drawSubstitutionMarks(context, left, right, bottom, unit, LINE_COLOR);
  drawGoalLineDistanceMarks(context, left, right, top, bottom, unit, LINE_COLOR, "both");
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
  const joinX = side === "left" ? left + penaltyDist : right - penaltyDist;

  if (side === "left") {
    const topJoinAngle = (Math.atan2(penaltyJoinTop - topPostY, joinX - left) * 180) / Math.PI;
    const bottomJoinAngle = (Math.atan2(penaltyJoinBottom - bottomPostY, joinX - left) * 180) / Math.PI;
    drawArc(context, left, topPostY, penaltyRadius, -90, topJoinAngle, lineColor, 2);
    drawArc(context, left, bottomPostY, penaltyRadius, bottomJoinAngle, 90, lineColor, 2);
    drawLine(context, joinX, penaltyJoinTop, joinX, penaltyJoinBottom, lineColor, 2, false);
    return;
  }

  const topJoinAngle = (Math.atan2(penaltyJoinTop - topPostY, joinX - right) * 180) / Math.PI;
  const bottomJoinAngle = (Math.atan2(penaltyJoinBottom - bottomPostY, joinX - right) * 180) / Math.PI;
  drawArc(context, right, topPostY, penaltyRadius, -90, topJoinAngle, lineColor, 2, true);
  drawArc(context, right, bottomPostY, penaltyRadius, 90, bottomJoinAngle, lineColor, 2);
  drawLine(context, joinX, penaltyJoinTop, joinX, penaltyJoinBottom, lineColor, 2, false);
}

function drawSubstitutionMarks(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  bottom: number,
  unit: number,
  lineColor: string
): void {
  const centerX = (left + right) * 0.5;
  const markLength = Math.max(8, 0.8 * unit);
  const marks = [centerX - 10 * unit, centerX - 5 * unit, centerX + 5 * unit, centerX + 10 * unit];
  for (const markX of marks) {
    drawLine(context, markX, bottom - markLength * 0.5, markX, bottom + markLength * 0.5, lineColor, 2, false);
  }
}

function drawGoalLineDistanceMarks(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  bottom: number,
  unit: number,
  lineColor: string,
  side: "both" | "left" | "right" = "both"
): void {
  const offset = 5 * unit;
  const markLength = Math.max(8, 0.6 * unit);
  const marksY = [top + offset, bottom - offset];
  for (const markY of marksY) {
    if (side === "both" || side === "left") {
      drawLine(context, left - markLength * 0.5, markY, left + markLength * 0.5, markY, lineColor, 2, false);
    }
    if (side === "both" || side === "right") {
      drawLine(context, right - markLength * 0.5, markY, right + markLength * 0.5, markY, lineColor, 2, false);
    }
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
  strokeRect(context, left, top, width, height, toRgba(drawable.style.stroke, drawable.style.opacity), drawable.style.strokeWidth);

  if (drawable.label) {
    context.fillStyle = contrastColor(drawable.style.fill);
    context.font = "600 12px 'Source Sans 3', sans-serif";
    context.fillText(drawable.label, left + 6, top + 16);
  }
}

function drawConnection(context: CanvasRenderingContext2D, drawable: Drawable, withArrowHead: boolean): void {
  const startX = drawable.x;
  const startY = drawable.y;
  const endX = drawable.x2 ?? drawable.x + (drawable.width ?? 0);
  const endY = drawable.y2 ?? drawable.y + (drawable.height ?? 0);
  const color = toRgba(drawable.style.stroke, drawable.style.opacity);
  const isDribble = isDribbleStyle(drawable);

  if (isDribble) {
    const accentColor = toRgba(blendHex(drawable.style.stroke, "#261708", 0.72), drawable.style.opacity * 0.72);
    const points = buildDribbleWavePoints(startX, startY, endX, endY, Math.max(3, drawable.style.strokeWidth));
    drawPolyline(context, points, accentColor, drawable.style.strokeWidth + 2);
    drawPolyline(context, points, color, Math.max(3, drawable.style.strokeWidth));
  } else {
    drawLine(context, startX, startY, endX, endY, color, drawable.style.strokeWidth, Boolean(drawable.style.dashed));
  }

  if (withArrowHead) {
    if (isDribble) {
      drawArrowHead(
        context,
        startX,
        startY,
        endX,
        endY,
        toRgba(blendHex(drawable.style.stroke, "#261708", 0.72), drawable.style.opacity * 0.72),
        drawable.style.strokeWidth + 2
      );
    }
    drawArrowHead(context, startX, startY, endX, endY, color, drawable.style.strokeWidth);
  }

  if (drawable.label) {
    context.fillStyle = color;
    context.font = "600 11px 'Source Sans 3', sans-serif";
    context.fillText(drawable.label, (startX + endX) * 0.5, (startY + endY) * 0.5 - 4);
  }
}

function drawPlayer(context: CanvasRenderingContext2D, drawable: Drawable, isGoalkeeper: boolean): void {
  const radius = resolvePlayerRadius(drawable);
  const fill = isGoalkeeper ? blendHex(drawable.style.fill, "#ef476f", 0.35) : drawable.style.fill;

  fillCircle(context, drawable.x, drawable.y, radius, toRgba(fill, drawable.style.opacity));
  const outlinePasses = Math.max(1, Math.round(drawable.style.strokeWidth));
  for (let offset = 0; offset < outlinePasses; offset += 1) {
    strokeCircle(context, drawable.x, drawable.y, radius + offset, toRgba(drawable.style.stroke, drawable.style.opacity), 1);
  }

  const markerEndX = drawable.x + Math.cos((drawable.rotation * Math.PI) / 180) * radius;
  const markerEndY = drawable.y + Math.sin((drawable.rotation * Math.PI) / 180) * radius;
  drawLine(context, drawable.x, drawable.y, markerEndX, markerEndY, toRgba(drawable.style.stroke, drawable.style.opacity), 1, false);

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
  const radius = resolveBallRadius(drawable);
  const seamColor = toRgba("#162334", drawable.style.opacity);
  const fillColor = toRgba("#fbfdff", drawable.style.opacity);
  const ringThickness = Math.max(2, drawable.style.strokeWidth);
  const pentagon = buildRegularPolygonPoints(drawable.x, drawable.y, Math.max(1.5, radius * 0.34), 5, -Math.PI * 0.5);
  fillCircle(context, drawable.x + radius * 0.18, drawable.y + radius * 0.16, radius, toRgba("#08131f", drawable.style.opacity * 0.14));
  fillCircle(context, drawable.x, drawable.y, radius, fillColor);
  strokeCircle(context, drawable.x, drawable.y, radius, seamColor, ringThickness);
  fillPolygon(context, pentagon, seamColor);
  if (radius >= 5) {
    for (const point of pentagon) {
      const angle = Math.atan2(point.y - drawable.y, point.x - drawable.x);
      const seamStartX = drawable.x + Math.cos(angle) * radius * 0.46;
      const seamStartY = drawable.y + Math.sin(angle) * radius * 0.46;
      const seamEndX = drawable.x + Math.cos(angle) * radius * 0.83;
      const seamEndY = drawable.y + Math.sin(angle) * radius * 0.83;
      drawLine(context, seamStartX, seamStartY, seamEndX, seamEndY, seamColor, Math.max(1.5, radius * 0.16), false);
    }
  }
  fillCircle(
    context,
    drawable.x - radius * 0.28,
    drawable.y - radius * 0.26,
    Math.max(1, radius * 0.16),
    toRgba("#ffffff", drawable.style.opacity * 0.85)
  );
}

function drawCone(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const size = Math.max(drawable.width ?? CONE_DIAMETER, drawable.height ?? CONE_DIAMETER, CONE_DIAMETER);
  const height = size * 1.18;
  const body = buildConeBodyPoints(drawable.x, drawable.y, size, height);
  const band = buildConeBandPoints(body, 0.58, 0.8);
  const highlight = buildConeHighlightPoints(drawable.x, drawable.y, size, height);
  const fill = toRgba(drawable.style.fill, drawable.style.opacity);
  const outline = toRgba(drawable.style.stroke, drawable.style.opacity);
  const bandFill = toRgba(blendHex(drawable.style.fill, "#9a4d10", 0.45), drawable.style.opacity);
  const highlightFill = toRgba(blendHex(drawable.style.fill, "#fff2c7", 0.32), drawable.style.opacity * 0.92);

  fillPolygon(context, body, fill);
  fillPolygon(context, highlight, highlightFill);
  fillPolygon(context, band, bandFill);
  drawPolyline(context, [...body, body[0]], outline, Math.max(1, drawable.style.strokeWidth));
}

function drawLabelTag(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const text = drawable.label?.trim() || "Label";
  context.font = "600 12px 'Source Sans 3', sans-serif";
  const metrics = context.measureText(text);
  const width = metrics.width + 12;
  const height = 22;

  context.fillStyle = toRgba(drawable.style.fill, drawable.style.opacity);
  context.fillRect(drawable.x, drawable.y, width, height);
  strokeRect(context, drawable.x, drawable.y, width, height, toRgba(drawable.style.stroke, drawable.style.opacity), drawable.style.strokeWidth);

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

  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  context.restore();
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
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance === 0) {
    return;
  }

  const unitX = (endX - startX) / distance;
  const unitY = (endY - startY) / distance;

  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.lineCap = "round";

  for (let cursor = 0; cursor < distance; cursor += DASH_LENGTH + DASH_GAP) {
    const dashStart = cursor;
    const dashEnd = Math.min(cursor + DASH_LENGTH, distance);
    context.beginPath();
    context.moveTo(startX + unitX * dashStart, startY + unitY * dashStart);
    context.lineTo(startX + unitX * dashEnd, startY + unitY * dashEnd);
    context.stroke();
  }

  context.restore();
}

function drawWavyLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  thickness: number
): void {
  drawPolyline(context, buildDribbleWavePoints(startX, startY, endX, endY, thickness), color, thickness);
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
  const length = 14 + thickness;

  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - length * Math.cos(angle - Math.PI / 7), endY - length * Math.sin(angle - Math.PI / 7));
  context.lineTo(endX - length * Math.cos(angle + Math.PI / 7), endY - length * Math.sin(angle + Math.PI / 7));
  context.closePath();
  context.fill();
  context.restore();
}

function drawPolyline(
  context: CanvasRenderingContext2D,
  points: FramePoint[],
  color: string,
  thickness: number
): void {
  if (points.length < 2) {
    return;
  }

  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.stroke();
  context.restore();
}

function fillPolygon(context: CanvasRenderingContext2D, points: FramePoint[], color: string): void {
  if (points.length < 3) {
    return;
  }

  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function buildDribbleWavePoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thickness: number
): FramePoint[] {
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance === 0) {
    return [];
  }

  const unitX = (endX - startX) / distance;
  const unitY = (endY - startY) / distance;
  const normalX = -unitY;
  const normalY = unitX;
  const amplitude = Math.min(6.25, Math.max(3.25, thickness * 1.15)) * Math.min(1, Math.max(0.7, distance / 42));
  const cycles = Math.min(4.25, Math.max(1.15, distance / 48));
  const steps = Math.max(18, Math.ceil(distance / 6));
  const points: FramePoint[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const baseX = startX + unitX * distance * t;
    const baseY = startY + unitY * distance * t;
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.85);
    const offset = Math.sin(t * Math.PI * 2 * cycles) * amplitude * envelope;
    points.push({
      x: baseX + normalX * offset,
      y: baseY + normalY * offset
    });
  }

  return points;
}

function buildRegularPolygonPoints(
  centerX: number,
  centerY: number,
  radius: number,
  sides: number,
  startAngleRad: number
): FramePoint[] {
  const points: FramePoint[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = startAngleRad + (Math.PI * 2 * index) / sides;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  }
  return points;
}

function buildConeBodyPoints(centerX: number, centerY: number, size: number, height: number): FramePoint[] {
  return [
    { x: centerX - size * 0.18, y: centerY - height * 0.46 },
    { x: centerX + size * 0.18, y: centerY - height * 0.46 },
    { x: centerX + size * 0.46, y: centerY + height * 0.42 },
    { x: centerX - size * 0.46, y: centerY + height * 0.42 }
  ];
}

function buildConeBandPoints(body: FramePoint[], startT: number, endT: number): FramePoint[] {
  const topLeft = lerpPoint(body[0], body[3], startT);
  const topRight = lerpPoint(body[1], body[2], startT);
  const bottomRight = lerpPoint(body[1], body[2], endT);
  const bottomLeft = lerpPoint(body[0], body[3], endT);
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function buildConeHighlightPoints(centerX: number, centerY: number, size: number, height: number): FramePoint[] {
  return [
    { x: centerX - size * 0.12, y: centerY - height * 0.22 },
    { x: centerX - size * 0.01, y: centerY - height * 0.1 },
    { x: centerX + size * 0.08, y: centerY + height * 0.12 },
    { x: centerX - size * 0.02, y: centerY + height * 0.26 }
  ];
}

function lerpPoint(a: FramePoint, b: FramePoint, t: number): FramePoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
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
  context.lineWidth = thickness;
  context.strokeRect(x, y, width, height);
  context.restore();
}

function fillCircle(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string
): void {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function strokeCircle(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  color: string,
  thickness: number
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawArc(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  color: string,
  thickness: number,
  anticlockwise = false
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.beginPath();
  context.arc(
    centerX,
    centerY,
    radius,
    (startAngleDeg * Math.PI) / 180,
    (endAngleDeg * Math.PI) / 180,
    anticlockwise
  );
  context.stroke();
  context.restore();
}

function resolvePlayerRadius(drawable: Drawable): number {
  return Math.max(8, Math.min(Math.max(drawable.width ?? PLAYER_DIAMETER, drawable.height ?? PLAYER_DIAMETER) * 0.5, 12));
}

function resolveBallRadius(drawable: Drawable): number {
  return Math.max(5, Math.min(Math.max(drawable.width ?? BALL_DIAMETER, drawable.height ?? BALL_DIAMETER) * 0.5, 7));
}

function toRgba(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function contrastColor(hex: string): string {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0b1220" : "#f8fafc";
}

function blendHex(base: string, mix: string, weight: number): string {
  const [baseR, baseG, baseB] = hexToRgb(base);
  const [mixR, mixG, mixB] = hexToRgb(mix);
  const next = [
    Math.round(baseR + (mixR - baseR) * weight),
    Math.round(baseG + (mixG - baseG) * weight),
    Math.round(baseB + (mixB - baseB) * weight)
  ];
  return `#${next.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function isDribbleStyle(drawable: Drawable): boolean {
  return drawable.type === "arrow" && drawable.style.stroke.toLowerCase() === DRIBBLE_STROKE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

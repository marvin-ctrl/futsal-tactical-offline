import type { CourtType, Drawable } from "../types/domain";

export interface TacticalFrameOptions {
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
const RUNOFF_COLOR = "#bf6e2b";
const SURFACE_COLOR = "#1388b8";
const LINE_COLOR = "#f8fcff";
const LOGICAL_WIDTH = 1000;
const LOGICAL_HEIGHT = 500;
const HALF_CROP_SIZE = 500;
const HALF_FRAME_WIDTH = 900;
const HALF_FRAME_HEIGHT = 1000;
const PLAYER_DIAMETER = 24;
const BALL_DIAMETER = 10;
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
  if (normalizedCourtType !== "full") {
    context.beginPath();
    context.rect(mapping.contentRect.x, mapping.contentRect.y, mapping.contentRect.width, mapping.contentRect.height);
    context.clip();
  }
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

  if (normalizedCourtType === "full") {
    const scaleX = frameWidth / LOGICAL_WIDTH;
    const scaleY = frameHeight / LOGICAL_HEIGHT;
    return {
      frameWidth,
      frameHeight,
      contentRect: { x: 0, y: 0, width: frameWidth, height: frameHeight },
      frameToWorld: (point) => ({
        x: clamp(point.x / scaleX, 0, LOGICAL_WIDTH),
        y: clamp(point.y / scaleY, 0, LOGICAL_HEIGHT)
      }),
      worldToFrame: (point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY
      }),
      applyToContext: (context) => {
        context.transform(scaleX, 0, 0, scaleY, 0, 0);
      }
    };
  }

  const squareSize = Math.min(frameWidth, frameHeight);
  const rect = {
    x: (frameWidth - squareSize) * 0.5,
    y: (frameHeight - squareSize) * 0.5,
    width: squareSize,
    height: squareSize
  };
  const scale = squareSize / HALF_CROP_SIZE;

  if (normalizedCourtType === "half-attacking") {
    return {
      frameWidth,
      frameHeight,
      contentRect: rect,
      frameToWorld: (point) => {
        const localX = clamp((point.x - rect.x) / scale, 0, HALF_CROP_SIZE);
        const localY = clamp((point.y - rect.y) / scale, 0, HALF_CROP_SIZE);
        return {
          x: clamp(LOGICAL_WIDTH - localY, 0, LOGICAL_WIDTH),
          y: clamp(localX, 0, LOGICAL_HEIGHT)
        };
      },
      worldToFrame: (point) => ({
        x: rect.x + point.y * scale,
        y: rect.y + (LOGICAL_WIDTH - point.x) * scale
      }),
      applyToContext: (context) => {
        context.transform(0, -scale, scale, 0, rect.x, rect.y + LOGICAL_WIDTH * scale);
      }
    };
  }

  return {
    frameWidth,
    frameHeight,
    contentRect: rect,
    frameToWorld: (point) => {
      const localX = clamp((point.x - rect.x) / scale, 0, HALF_CROP_SIZE);
      const localY = clamp((point.y - rect.y) / scale, 0, HALF_CROP_SIZE);
      return {
        x: clamp(localY, 0, LOGICAL_WIDTH),
        y: clamp(HALF_CROP_SIZE - localX, 0, LOGICAL_HEIGHT)
      };
    },
    worldToFrame: (point) => ({
      x: rect.x + (HALF_CROP_SIZE - point.y) * scale,
      y: rect.y + point.x * scale
    }),
    applyToContext: (context) => {
      context.transform(0, scale, -scale, 0, rect.x + HALF_CROP_SIZE * scale, rect.y);
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

function drawFullCourt(context: CanvasRenderingContext2D, width: number, height: number): void {
  const margin = Math.min(width, height) * 0.045;
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
  const penaltyJoinHalf = 1.58 * unit;
  const penaltyJoinTop = centerY - penaltyJoinHalf;
  const penaltyJoinBottom = centerY + penaltyJoinHalf;

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

  drawLine(context, left + penaltyDist, penaltyJoinTop, left + penaltyDist, penaltyJoinBottom, LINE_COLOR, 2, false);
  drawLine(context, right - penaltyDist, penaltyJoinTop, right - penaltyDist, penaltyJoinBottom, LINE_COLOR, 2, false);

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
  bottom: number,
  unit: number,
  lineColor: string
): void {
  const centerX = (left + right) * 0.5;
  const markLength = Math.max(8, 0.8 * unit);
  const marks = [centerX - 10 * unit, centerX - 5 * unit, centerX + 5 * unit, centerX + 10 * unit];
  for (const markX of marks) {
    drawLine(context, markX, bottom - markLength * 0.4, markX, bottom + markLength, lineColor, 2, false);
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
      drawLine(context, left - markLength * 0.5, markY, left + markLength, markY, lineColor, 2, false);
    }
    if (side === "both" || side === "right") {
      drawLine(context, right - markLength, markY, right + markLength * 0.5, markY, lineColor, 2, false);
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

  if (isDribbleStyle(drawable)) {
    drawWavyLine(context, startX, startY, endX, endY, color, Math.max(3, drawable.style.strokeWidth));
  } else {
    drawLine(context, startX, startY, endX, endY, color, drawable.style.strokeWidth, Boolean(drawable.style.dashed));
  }

  if (withArrowHead) {
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
  const seamColor = toRgba("#0f172a", drawable.style.opacity);
  const fillColor = toRgba("#f8fafc", drawable.style.opacity);
  fillCircle(context, drawable.x, drawable.y, radius, fillColor);
  strokeCircle(context, drawable.x, drawable.y, radius, seamColor, Math.max(1, drawable.style.strokeWidth));
  drawArc(context, drawable.x - radius * 0.12, drawable.y, radius * 0.5, 80, 280, seamColor, 1);
  drawArc(context, drawable.x + radius * 0.12, drawable.y, radius * 0.5, -100, 100, seamColor, 1);
  drawLine(context, drawable.x - radius * 0.18, drawable.y - radius * 0.48, drawable.x + radius * 0.18, drawable.y + radius * 0.48, seamColor, 1, false);
}

function drawCone(context: CanvasRenderingContext2D, drawable: Drawable): void {
  const size = Math.max(drawable.width ?? 10, drawable.height ?? 10, 10);
  const left = drawable.x - size * 0.5;
  const top = drawable.y - size * 0.5;

  context.fillStyle = toRgba(drawable.style.fill, drawable.style.opacity);
  context.fillRect(left, top, size, size);
  strokeRect(context, left, top, size, size, toRgba(drawable.style.stroke, drawable.style.opacity), drawable.style.strokeWidth);
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
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance === 0) {
    return;
  }

  const unitX = (endX - startX) / distance;
  const unitY = (endY - startY) / distance;
  const normalX = -unitY;
  const normalY = unitX;
  const amplitude = Math.max(5, thickness * 1.8);
  const wavelength = 28;
  const cycles = Math.max(1.5, distance / wavelength);
  const steps = Math.max(16, Math.ceil(distance / 8));

  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const baseX = startX + unitX * distance * t;
    const baseY = startY + unitY * distance * t;
    const offset = Math.sin(t * Math.PI * 2 * cycles) * amplitude;
    const waveX = baseX + normalX * offset;
    const waveY = baseY + normalY * offset;
    if (step === 0) {
      context.moveTo(waveX, waveY);
    } else {
      context.lineTo(waveX, waveY);
    }
  }

  context.stroke();
  context.restore();
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
  thickness: number
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = thickness;
  context.beginPath();
  context.arc(centerX, centerY, radius, (startAngleDeg * Math.PI) / 180, (endAngleDeg * Math.PI) / 180);
  context.stroke();
  context.restore();
}

function resolvePlayerRadius(drawable: Drawable): number {
  return Math.max(8, Math.min(Math.max(drawable.width ?? PLAYER_DIAMETER, drawable.height ?? PLAYER_DIAMETER) * 0.5, 12));
}

function resolveBallRadius(drawable: Drawable): number {
  return Math.max(4, Math.min(Math.max(drawable.width ?? BALL_DIAMETER, drawable.height ?? BALL_DIAMETER) * 0.5, 6));
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

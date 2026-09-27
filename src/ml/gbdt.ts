// Minimal, dependency-free Gradient Boosted Decision Trees, written from scratch in
// TypeScript. It implements the same core math as XGBoost - second-order (Newton)
// boosting on regression trees, with L2-regularized leaf weights and a gain formula
// derived from gradients and hessians - which is what actually makes XGBoost "XGBoost"
// rather than plain gradient descent boosting.
//
// The real xgboost package needs a native/Python binary, which can't run inside this
// project's Vercel Node serverless functions or the Vite/esbuild bundles, so this file
// is the practical equivalent for this stack: same algorithm, pure TypeScript, trained
// offline by scripts/trainThermalClassifier.ts and shipped as a plain JSON-like model.

export interface TreeNode {
  leaf?: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

interface FitOptions {
  maxDepth: number;
  minSamplesLeaf: number;
  lambda: number; // L2 regularization on leaf weights
}

function buildTree(
  X: number[][],
  grad: number[],
  hess: number[],
  indices: number[],
  depth: number,
  opts: FitOptions
): TreeNode {
  const leafWeight = (idx: number[]): number => {
    let g = 0, h = 0;
    for (const i of idx) { g += grad[i]; h += hess[i]; }
    return -g / (h + opts.lambda);
  };

  if (depth >= opts.maxDepth || indices.length < opts.minSamplesLeaf * 2) {
    return { leaf: leafWeight(indices) };
  }

  const nFeatures = X[0].length;
  const totalG = indices.reduce((s, i) => s + grad[i], 0);
  const totalH = indices.reduce((s, i) => s + hess[i], 0);
  const score = (g: number, h: number) => (g * g) / (h + opts.lambda);
  const parentScore = score(totalG, totalH);

  let bestGain = 1e-9;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  for (let f = 0; f < nFeatures; f++) {
    const sorted = [...indices].sort((a, b) => X[a][f] - X[b][f]);
    let gLeft = 0, hLeft = 0;
    for (let k = 0; k < sorted.length - 1; k++) {
      const i = sorted[k];
      gLeft += grad[i]; hLeft += hess[i];
      if (X[sorted[k]][f] === X[sorted[k + 1]][f]) continue; // only split between distinct values

      const leftCount = k + 1;
      const rightCount = sorted.length - leftCount;
      if (leftCount < opts.minSamplesLeaf || rightCount < opts.minSamplesLeaf) continue;

      const gRight = totalG - gLeft, hRight = totalH - hLeft;
      const gain = score(gLeft, hLeft) + score(gRight, hRight) - parentScore;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = (X[sorted[k]][f] + X[sorted[k + 1]][f]) / 2;
        bestLeft = sorted.slice(0, leftCount);
        bestRight = sorted.slice(leftCount);
      }
    }
  }

  if (bestFeature === -1) return { leaf: leafWeight(indices) };

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildTree(X, grad, hess, bestLeft, depth + 1, opts),
    right: buildTree(X, grad, hess, bestRight, depth + 1, opts),
  };
}

export function predictTree(node: TreeNode, x: number[]): number {
  let n = node;
  while (n.leaf === undefined) {
    n = x[n.featureIndex!] <= n.threshold! ? n.left! : n.right!;
  }
  return n.leaf;
}

export interface BoostedModel {
  trees: TreeNode[];
  learningRate: number;
  basePrediction: number;
}

// Trains a binary logistic gradient-boosted ensemble (log-loss, Newton boosting).
// Multi-class classification is handled one-vs-rest, one BoostedModel per class.
export function trainBinaryGBDT(
  X: number[][],
  y: number[], // 0/1 labels
  nTrees: number,
  learningRate: number,
  maxDepth: number,
  minSamplesLeaf: number = 8,
  lambda: number = 1.0
): BoostedModel {
  const n = X.length;
  const positiveRate = Math.min(0.999, Math.max(0.001, y.reduce((s, v) => s + v, 0) / n));
  const basePrediction = Math.log(positiveRate / (1 - positiveRate));
  const rawScore = new Array(n).fill(basePrediction);
  const trees: TreeNode[] = [];
  const allIndices = X.map((_, i) => i);

  for (let t = 0; t < nTrees; t++) {
    const grad = new Array(n);
    const hess = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = 1 / (1 + Math.exp(-rawScore[i]));
      grad[i] = p - y[i];
      hess[i] = Math.max(1e-6, p * (1 - p));
    }
    const tree = buildTree(X, grad, hess, allIndices, 0, { maxDepth, minSamplesLeaf, lambda });
    trees.push(tree);
    for (let i = 0; i < n; i++) rawScore[i] += learningRate * predictTree(tree, X[i]);
  }

  return { trees, learningRate, basePrediction };
}

export function predictBoosted(model: BoostedModel, x: number[]): number {
  let score = model.basePrediction;
  for (const tree of model.trees) score += model.learningRate * predictTree(tree, x);
  return 1 / (1 + Math.exp(-score));
}

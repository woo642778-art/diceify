export type LocalModelTierV63 = "lite" | "advanced";

export interface LocalModelOptionV63 {
  tier: LocalModelTierV63;
  modelId: string;
  label: string;
  repositoryBytes: number;
  approximateDownload: string;
  license: "Apache-2.0";
  minimumMemoryNote: string;
}

export const LOCAL_MODEL_OPTIONS_V63: readonly LocalModelOptionV63[] = [
  {
    tier: "lite",
    modelId: "Qwen3-1.7B-q4f16_1-MLC",
    label: "Qwen3 1.7B Lite",
    repositoryBytes: 984_156_278,
    approximateDownload: "약 0.98 GB + WebGPU 런타임",
    license: "Apache-2.0",
    minimumMemoryNote: "데스크톱과 메모리가 충분한 최신 모바일 브라우저 권장",
  },
  {
    tier: "advanced",
    modelId: "Qwen3-4B-q4f16_1-MLC",
    label: "Qwen3 4B Advanced",
    repositoryBytes: 2_279_167_154,
    approximateDownload: "약 2.28 GB + WebGPU 런타임",
    license: "Apache-2.0",
    minimumMemoryNote: "전용 GPU 메모리 3 GB 이상인 데스크톱 권장",
  },
] as const;

export function localAiCapabilityV63() {
  const browser = typeof window !== "undefined";
  const gpu = browser && "gpu" in navigator;
  const worker = browser && typeof Worker !== "undefined";
  const cache = browser && "caches" in window;
  return {
    supported: gpu && worker,
    webgpu: gpu,
    worker,
    cache,
    reason: !gpu ? "WebGPU를 사용할 수 없습니다." : !worker ? "Web Worker를 사용할 수 없습니다." : null,
  };
}

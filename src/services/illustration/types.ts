export interface IllustrationInput {
  sourceImageUrl: string;
  style: "watercolor" | "oil_painting" | "pencil_sketch";
  customPrompt?: string;
  preserveIdentity: boolean;
  outputFormat: "png" | "jpeg";
  outputWidth: number;
  outputHeight: number;
}

export interface IllustrationOutput {
  imageBuffer: Buffer;
  modelUsed: string;
  promptUsed: string;
}

export interface IllustrationProvider {
  stylizeImage(input: IllustrationInput): Promise<IllustrationOutput>;
}

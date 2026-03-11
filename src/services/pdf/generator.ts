import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { AlbumDocument } from "./album-document";

interface GeneratePdfInput {
  personName: string;
  occasion?: string;
  pages: {
    pageNumber: number;
    textContent: string | null;
    illustrationUrl: string | null;
    pageType: string;
  }[];
}

export async function generateAlbumPdf(
  input: GeneratePdfInput
): Promise<Buffer> {
  const doc = React.createElement(AlbumDocument, {
    personName: input.personName,
    pages: input.pages,
    occasion: input.occasion,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(doc as any);
  return Buffer.from(buffer);
}

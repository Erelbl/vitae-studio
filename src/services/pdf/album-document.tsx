import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { registerFonts } from "./fonts";

registerFonts();

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFEF7",
    padding: 40,
    fontFamily: "FrankRuhlLibre",
  },
  coverPage: {
    flexDirection: "column",
    backgroundColor: "#FFFEF7",
    padding: 60,
    fontFamily: "FrankRuhlLibre",
    justifyContent: "center",
    alignItems: "center",
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: 700,
    textAlign: "center",
    direction: "rtl",
    marginBottom: 20,
    color: "#1a1a2e",
  },
  coverSubtitle: {
    fontSize: 18,
    textAlign: "center",
    direction: "rtl",
    color: "#555",
  },
  illustration: {
    width: "100%",
    maxHeight: 400,
    objectFit: "contain",
    marginBottom: 20,
    borderRadius: 4,
  },
  textContent: {
    fontSize: 16,
    lineHeight: 2,
    textAlign: "right",
    direction: "rtl",
    color: "#2a2a2a",
    fontFamily: "FrankRuhlLibre",
  },
  pageNumber: {
    position: "absolute",
    fontSize: 10,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#999",
    fontFamily: "Heebo",
  },
});

interface AlbumPageData {
  pageNumber: number;
  textContent: string | null;
  illustrationUrl: string | null;
  pageType: string;
}

interface AlbumDocumentProps {
  personName: string;
  pages: AlbumPageData[];
  occasion?: string;
}

export function AlbumDocument({
  personName,
  pages,
  occasion,
}: AlbumDocumentProps) {
  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverTitle}>סיפור חייו של {personName}</Text>
        {occasion && (
          <Text style={styles.coverSubtitle}>
            {occasion === "birthday" && "לכבוד יום ההולדת"}
            {occasion === "retirement" && "לכבוד הפרישה"}
            {occasion === "memorial" && "לזכרו"}
            {occasion === "anniversary" && "לכבוד יום הנישואין"}
          </Text>
        )}
      </Page>

      {/* Content Pages */}
      {pages.map((page) => (
        <Page key={page.pageNumber} size="A4" style={styles.page}>
          {page.illustrationUrl && (
            <Image src={page.illustrationUrl} style={styles.illustration} />
          )}
          {page.textContent && (
            <View>
              <Text style={styles.textContent}>{page.textContent}</Text>
            </View>
          )}
          <Text style={styles.pageNumber}>{page.pageNumber}</Text>
        </Page>
      ))}
    </Document>
  );
}

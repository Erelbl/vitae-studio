import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const locale = "he"; // MVP: Hebrew only. Future: detect from URL/cookie

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});

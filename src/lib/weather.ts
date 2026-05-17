// filepath: src/lib/weather.ts
/* 💡 気象データ処理・野球コンテキスト変換ユーティリティ */

export interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
}

/**
 * 💡 緯度経度から「都道府県＋市区町村＋区」を取得する
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ja`
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      const addr = data.address || {};
      // 都道府県 + 市区町村 + 区(あれば) を連結
      const pref = addr.province || addr.state || addr.region || "";
      const city = addr.city || addr.town || addr.village || "";
      const dist = addr.city_district || addr.suburb || addr.ward || "";
      return `${pref}${city}${dist}` || "現在地";
    }
    return "現在地";
  } catch (e) {
    return "現在地";
  }
}

export function getWindDirectionLabel(degree: number): string {
  const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  const index = Math.round(degree / 22.5) % 16;
  return directions[index];
}

export function getWMOWeatherText(code: number): string {
  const weatherMap: Record<number, string> = {
    0: "快晴", 1: "晴れ", 2: "晴れ", 3: "曇り", 45: "霧", 48: "霧",
    51: "霧雨", 61: "小雨", 63: "雨", 80: "にわか雨", 95: "雷雨"
  };
  return weatherMap[code] || "不明";
}

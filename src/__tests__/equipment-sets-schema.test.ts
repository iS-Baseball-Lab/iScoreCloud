// filepath: src/__tests__/equipment-sets-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_SET_STARTER_TEMPLATES,
  applyDefaultEquipmentsToCarSlots,
  applyPreviousCarpoolEquipments,
  distributeEquipmentsAcrossCarSlots,
  inferEquipmentSetCategoryFromName,
  matchEquipmentIdsForStarterTemplate,
  parseEquipmentSetsJson,
  recommendEquipmentSetIds,
  sanitizeEquipmentSetsForSave,
  type CarSlotForEquipmentCalc,
  type EquipmentMetaForCalc,
  type EquipmentSetItem,
} from "@/lib/liff/equipment-sets-schema";

describe("equipment-sets-schema", () => {
  it("parses and sanitizes equipment sets JSON while removing deleted equipment IDs", () => {
    const raw = JSON.stringify([
      {
        id: "set_1",
        name: " 硬式戦セット ",
        category: "invalid_category",
        description: "硬式試合で使用する一式",
        equipmentIds: ["eq_1", "eq_2", "eq_deleted", "eq_1", ""],
      },
      {
        id: "set_1", // 重複IDは除外
        name: "重複セット",
        category: "custom",
        equipmentIds: ["eq_1"],
      },
      {
        id: "set_2",
        name: "OP戦セット",
        category: "practice_match",
        description: "",
        equipmentIds: ["eq_2", "eq_3"],
      },
    ]);

    const validIds = new Set(["eq_1", "eq_2", "eq_3"]);
    const parsed = sanitizeEquipmentSetsForSave(raw, validIds);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: "set_1",
      name: "硬式戦セット",
      category: "hardball",
      description: "硬式試合で使用する一式",
      equipmentIds: ["eq_1", "eq_2"],
    });
    expect(parsed[1]).toEqual({
      id: "set_2",
      name: "OP戦セット",
      category: "practice_match",
      description: "",
      equipmentIds: ["eq_2", "eq_3"],
    });

    // 二重JSON文字列でも安全にパースできること
    expect(parseEquipmentSetsJson(JSON.stringify(raw), validIds)).toHaveLength(
      2
    );
    expect(parseEquipmentSetsJson("not-json")).toEqual([]);
  });

  it("infers set categories from Japanese set names", () => {
    expect(inferEquipmentSetCategoryFromName("硬式戦フルセット")).toBe(
      "hardball"
    );
    expect(inferEquipmentSetCategoryFromName("OP戦・練習試合道具")).toBe(
      "practice_match"
    );
    expect(inferEquipmentSetCategoryFromName("春季公式戦大会セット")).toBe(
      "official"
    );
    expect(inferEquipmentSetCategoryFromName("夏場・遠征熱中症対策")).toBe(
      "expedition"
    );
    expect(inferEquipmentSetCategoryFromName("土曜通常練習")).toBe("practice");
    expect(inferEquipmentSetCategoryFromName("低学年ミニセット")).toBe(
      "custom"
    );
  });

  it("matches team equipments against starter templates with include/exclude keywords", () => {
    const sampleEquipments = [
      { id: "eq_catcher", name: "キャッチャー防具一式", description: "" },
      { id: "eq_flag", name: "チーム団旗・プラカード", description: "開会式用" },
      { id: "eq_bso", name: "BSOインジケーター・携帯得点盤", description: "" },
      { id: "eq_hard", name: "硬式試合球ケース", description: "硬式戦用" },
      { id: "eq_line", name: "ラインカー（石灰）", description: "練習専用" },
    ];

    const officialTpl = EQUIPMENT_SET_STARTER_TEMPLATES.find(
      (t) => t.key === "official"
    )!;
    const opTpl = EQUIPMENT_SET_STARTER_TEMPLATES.find(
      (t) => t.key === "practice_match"
    )!;
    const hardballTpl = EQUIPMENT_SET_STARTER_TEMPLATES.find(
      (t) => t.key === "hardball"
    )!;

    const officialMatched = matchEquipmentIdsForStarterTemplate(
      officialTpl,
      sampleEquipments
    );
    expect(officialMatched).toContain("eq_catcher");
    expect(officialMatched).toContain("eq_flag");
    expect(officialMatched).not.toContain("eq_line");

    const opMatched = matchEquipmentIdsForStarterTemplate(
      opTpl,
      sampleEquipments
    );
    expect(opMatched).toContain("eq_catcher");
    expect(opMatched).toContain("eq_bso");
    expect(opMatched).not.toContain("eq_flag");

    const hardballMatched = matchEquipmentIdsForStarterTemplate(
      hardballTpl,
      sampleEquipments
    );
    expect(hardballMatched).toContain("eq_hard");
    expect(hardballMatched).toContain("eq_catcher");
  });

  it("recommends matching equipment sets from event title and summer date", () => {
    const sets: EquipmentSetItem[] = [
      {
        id: "s_official",
        name: "公式戦セット",
        category: "official",
        description: "",
        equipmentIds: ["eq_1"],
      },
      {
        id: "s_hard",
        name: "硬式戦セット",
        category: "hardball",
        description: "",
        equipmentIds: ["eq_2"],
      },
      {
        id: "s_op",
        name: "OP戦セット",
        category: "practice_match",
        description: "",
        equipmentIds: ["eq_3"],
      },
      {
        id: "s_summer",
        name: "遠征・夏場セット",
        category: "expedition",
        description: "",
        equipmentIds: ["eq_4"],
      },
    ];

    const opAugust = recommendEquipmentSetIds(
      sets,
      "〇〇クラブ 練習試合（OP戦）",
      "2026-08-15"
    );
    expect(opAugust.has("s_op")).toBe(true);
    expect(opAugust.has("s_summer")).toBe(true);
    expect(opAugust.has("s_official")).toBe(false);

    const hardballSpring = recommendEquipmentSetIds(
      sets,
      "春季硬式大会 1回戦",
      "2026-04-12"
    );
    expect(hardballSpring.has("s_hard")).toBe(true);
    expect(hardballSpring.has("s_official")).toBe(true);
    expect(hardballSpring.has("s_summer")).toBe(false);
  });

  it("auto-assigns default equipments by defaultCarId first, then defaultMemberId", () => {
    const slots: CarSlotForEquipmentCalc[] = [
      {
        localKey: "car_1",
        carId: "veh_alpha",
        driverMemberId: "mem_a",
        isCargo: false,
        isBus: false,
        capacity: 6,
        ridersCount: 2,
        equipmentIds: [],
      },
      {
        localKey: "car_2",
        carId: "veh_cargo",
        driverMemberId: "mem_b",
        isCargo: true,
        isBus: false,
        capacity: 3,
        ridersCount: 0,
        equipmentIds: [],
      },
    ];

    const equipments: EquipmentMetaForCalc[] = [
      {
        id: "eq_tent",
        isHeavy: true,
        // 保管担当は mem_a だが、常設車両が veh_cargo の場合は veh_cargo 優先
        defaultCarId: "veh_cargo",
        defaultMemberId: "mem_a",
      },
      {
        id: "eq_aid",
        isHeavy: false,
        defaultCarId: null,
        defaultMemberId: "mem_a",
      },
    ];

    const { equipmentIdsBySlotKey, addedCount } =
      applyDefaultEquipmentsToCarSlots({ slots, equipments });

    expect(addedCount).toBe(2);
    expect(equipmentIdsBySlotKey.get("car_2")).toEqual(["eq_tent"]);
    expect(equipmentIdsBySlotKey.get("car_1")).toEqual(["eq_aid"]);
  });

  it("distributes heavy items to cargo cars and spreads light items across spare-capacity cars", () => {
    const slots: CarSlotForEquipmentCalc[] = [
      {
        localKey: "normal_full",
        carId: "veh_1",
        driverMemberId: "mem_1",
        isCargo: false,
        isBus: false,
        capacity: 4,
        ridersCount: 4, // 満席
        equipmentIds: [],
      },
      {
        localKey: "normal_roomy",
        carId: "veh_2",
        driverMemberId: "mem_2",
        isCargo: false,
        isBus: false,
        capacity: 7,
        ridersCount: 2, // 空き5席
        equipmentIds: [],
      },
      {
        localKey: "cargo_van",
        carId: "veh_3",
        driverMemberId: "mem_3",
        isCargo: true,
        isBus: false,
        capacity: 2,
        ridersCount: 0,
        equipmentIds: [],
      },
    ];

    const equipments: EquipmentMetaForCalc[] = [
      { id: "heavy_1", isHeavy: true },
      { id: "heavy_2", isHeavy: true },
      { id: "light_aid", isHeavy: false },
      { id: "light_bso", isHeavy: false, defaultMemberId: "mem_1" },
    ];

    const { equipmentIdsBySlotKey, newlyPlacedCount } =
      distributeEquipmentsAcrossCarSlots({
        targetEquipmentIds: ["heavy_1", "heavy_2", "light_aid", "light_bso"],
        slots,
        equipments,
      });

    expect(newlyPlacedCount).toBe(4);
    // 重量物2点は道具車へ
    expect(equipmentIdsBySlotKey.get("cargo_van")).toContain("heavy_1");
    expect(equipmentIdsBySlotKey.get("cargo_van")).toContain("heavy_2");
    // 担当指定のある light_bso は mem_1 へ
    expect(equipmentIdsBySlotKey.get("normal_full")).toEqual(["light_bso"]);
    // 残りの軽量備品は空席に余裕のある normal_roomy（または余裕枠）へ入り、満席の normal_full には入らない
    expect(equipmentIdsBySlotKey.get("normal_roomy")).toContain("light_aid");
  });

  it("carries over previous carpool equipment assignments by carId, driverMemberId, and cargo fallback", () => {
    const slots: CarSlotForEquipmentCalc[] = [
      {
        localKey: "slot_a",
        carId: "veh_same",
        driverMemberId: "mem_other",
        isCargo: false,
        isBus: false,
        capacity: 5,
        ridersCount: 1,
        equipmentIds: [],
      },
      {
        localKey: "slot_b",
        carId: "veh_new",
        driverMemberId: "mem_same_driver",
        isCargo: false,
        isBus: false,
        capacity: 5,
        ridersCount: 1,
        equipmentIds: [],
      },
      {
        localKey: "slot_cargo",
        carId: "veh_cargo_new",
        driverMemberId: "mem_cargo_new",
        isCargo: true,
        isBus: false,
        capacity: 2,
        ridersCount: 0,
        equipmentIds: [],
      },
    ];

    const { equipmentIdsBySlotKey, restoredCount } =
      applyPreviousCarpoolEquipments({
        slots,
        previousCars: [
          {
            carId: "veh_same",
            driverMemberId: "mem_old",
            isCargo: false,
            equipmentIds: ["eq_1", "eq_deleted"],
          },
          {
            carId: "veh_old",
            driverMemberId: "mem_same_driver",
            isCargo: false,
            equipmentIds: ["eq_2"],
          },
          {
            carId: "veh_old_cargo",
            driverMemberId: "mem_old_cargo",
            isCargo: true,
            equipmentIds: ["eq_3"],
          },
        ],
        validEquipmentIds: new Set(["eq_1", "eq_2", "eq_3"]),
      });

    expect(restoredCount).toBe(3);
    expect(equipmentIdsBySlotKey.get("slot_a")).toEqual(["eq_1"]);
    expect(equipmentIdsBySlotKey.get("slot_b")).toEqual(["eq_2"]);
    expect(equipmentIdsBySlotKey.get("slot_cargo")).toEqual(["eq_3"]);
  });
});

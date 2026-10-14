// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ahmed Shaalan

// Searches and the shop names they must (or must not) match. The names are real ones, copied
// from the shops. Run with `npm test`.
//
// match: a real match (STRONG or above)
// weak:  only behind "weaker matches"
// no:    not shown at all

import { test } from "node:test";
import assert from "node:assert/strict";
import { STRONG, WEAK, score, weakReason, packSize, searchVariants } from "../src/js/matching.js";

const verdict = (s) => (s >= STRONG ? "match" : s >= WEAK ? "weak" : "no");

const CASES = {
  "part numbers match their core": [
    ["LM7805", "L7805CV Linear Voltage Regulator 5V/1A out, TO-220", "match"],
    ["LM7805", "7805 Regulator", "match"],
    ["ATmega328P", "ATMEGA328P-PU DIP-28", "match"],
    ["mini 360", "Mini360 DC-DC Buck Converter", "match"],
  ],
  "values and part numbers must match": [
    ["10k resistor", "Resistor 910K 1/4W", "no"],
    ["10k resistor", "Resistor 110 KOHM 1/4W", "no"],
    ["4.7k resistor", "Resistor 47K 1/4W", "no"],
    ["4.7k resistor", "Resistor 4.7K 1/4W", "match"],
    ["1.5A fuse", "Fuse 15A 250V", "no"],
    ["LM7805", "LM7812 Voltage Regulator", "no"],
  ],
  "words match whole": [
    ["male header", "Female Header 40 Pin", "weak"],
    ["male header", "Male Header 40 Pin 2.54mm", "match"],
  ],
  "plurals and suffixes": [
    ["resistor 10k", "Resistors 10K 1/4W", "match"],
    ["esp32", "ESP32-S3 Development Board", "match"],
  ],
  "units and symbols": [
    ["220 ohm resistor", "Resistor 220Ω 1/4W", "match"],
    ["220 ohm resistor", "Resistor 220.0 ohm", "match"],
    ["100uF capacitor", "Electrolytic Capacitor 100µF 25V", "match"],
    ["16 x 2 LCD", "LCD 16x2 Blue Backlight", "match"],
  ],
  "values keep their units": [
    ["3.3V regulator", "Resistor 3.3 ohm 1/4W", "no"],
    ["fuse 250mA", "Glass Fuse 2A 250V", "no"],
    ["fuse 250mA", "Glass Fuse 0.25A 5x20mm", "match"],
  ],
  "makers' names are optional": [
    ["Omron Power Relay G2R-2 12VDC", "RELAY G2R-2-12VDC", "match"],
    ["Schneider contactor", "Contactor 9A 220V", "weak"],
  ],
  "aliases": [
    ["16x2 LCD", "LCD 1602 Blue Backlight", "match"],
    ["20x4 LCD", "LCD 2004 Display", "match"],
  ],
  "accessories rank lower": [
    ["Arduino UNO", "Acrylic case for Arduino UNO", "weak"],
    ["Arduino UNO", "Arduino UNO R3 Without cable", "match"],
    ["fuse holder T5x20", "Fuse Holder on PCB for T5x20", "match"],
    ["DS18B20", "DS18B20 Waterproof Temperature Sensor Cable 1m", "match"],
    ["18650 battery", "18650 Battery Holder 1 Cell", "weak"],
    ["18650 holder", "18650 Battery Holder 1 Cell", "match"],
    ["ESP32", "ESP32 Display with Acrylic Case", "match"],
    ["5mm LED", "5mm LED Spacer Column -Hight 2mm", "weak"],
    ["18650 battery", "18650 Battery Insulation Paper Hollow Pack 1S (Solid)", "weak"],
    ["18650 battery", "PVC Heat Shrink 18650 battery", "weak"],
    ["servo", "Metal Servo Horn (Round)", "weak"],
    ["servo", "Servo Extension Cable 30cm", "weak"],
    ["ESP32", "ESP32 Expansion Connection Shield", "weak"],
    ["breadboard", "65pcs Flexible Breadboard Jumper Wires", "weak"],
    ["ATmega328P", "Heat Shrink Tubing Set 328Pcs", "weak"],
    ["servo horn", "Metal Servo Horn (Round)", "match"],
    ["servo extension cable", "Servo Extension Cable 30cm", "match"],
    ["heat shrink 5mm", "Heat Shrink 5mm 1M Black", "match"],
    ["LED spacer", "5mm LED Spacer Column -Hight 2mm", "match"],
  ],
  "a number before a word describes the part": [
    ["fan", "3-wire Cooling Fan 12V", "match"],
  ],
  "1N diodes aren't 2N or MMBT transistors": [
    ["1N5401", "2N5401 PNP Transistor", "no"],
    ["1N5401", "MMBT5401 SMD Transistor", "no"],
    ["1N5401", "IN5401 Rectifier Diode 3A", "match"],
    ["1N5401", "1N5401RLG Diode", "match"],
    ["1N4148", "LL4148 SMD Diode", "match"],
  ],
  "a part number's digits inside a measurement are a coincidence": [
    ["IRF530N", "LED 530nm Green 5mm", "no"],
    ["TIP120", "Resistor 120 ohm 1/4W", "no"],
  ],
  "a potentiometer is not a fixed resistor": [
    ["10k resistor", "Variable Resistor - POT (10 K-Ohm) - 3296W", "weak"],
    ["10k trimmer", "Trimmer Potentiometer 10K 3296W", "match"],
  ],
  "common parts find themselves": [
    ["SG90 servo", "Mini Micro Servo Motor SG90 180 Degree (Plastic Gear)", "match"],
    ["16x2 LCD", "Character LCD 2x16 Blue 1602", "match"],
    ["1602 LCD display", "LCD1602 Parallel LCD Display with Blue Backlight", "match"],
    ["4 channel relay module", "Relay Module 5V (4 Channel) Active Low Trigger", "match"],
    ["4 channel relay module", "Relay Module (4 Channels - 5V)", "match"],
    ["10k resistor", "Resistor 1/4W (1Pcs) — 10k Ohm", "match"],
    ["10k potentiometer", "Rotary Taper Potentiometer POT (10K Ohm) (RV24YN20SB103)", "match"],
    ["trimmer", "Top Adjust 10K ohm Carbon Trimmer Potentiometer (RM065)", "match"],
    ["ESP32", "ESP32 Development Board WIFI and Bluetooth 30-Pin with CP2102", "match"],
    ["Arduino Uno", "Arduino UNO R3 Board Without Cable CH340", "match"],
    ["Arduino Nano", "Arduino Nano V3.0 CH340 Chip Without Cable", "match"],
    ["DS18B20", "DS18B20 Waterproof Temperature Sensor 3 Wire 100cm", "match"],
    ["HC-SR04", "Ultrasonic Sensor Module HC-SR04", "match"],
    ["1N4007", "1N4007F M7 SMAF Diodes – General Purpose Single 1.1V 1A SMD", "match"],
    ["2N2222", "Transistor 2N2222 NPN 800mA 75V", "match"],
    ["100nF capacitor", "Ceramic Capacitor 0.1uf 50v (100nf 50v – code PF104)", "match"],
    ["NE555", "LM555 Timer IC NE555 DIP-8", "match"],
    ["L298N", "L298N Motor Driver Module", "match"],
    ["ATmega328P", "ATmega328P-AU SMD Microcontroller", "match"],
    ["mini 360", "DC-DC Step Down Converter 3A Ultra Mini-360 (4.75V~23Vdc to 1V~17Vdc)", "match"],
    ["18650 battery", "18650 Battery Holder 1 Cell", "weak"],
    ["5mm LED", "LED 5mm Red Color", "match"],
    ["jumper wires", "20cm Male-to-Female Jumper Wires", "match"],
    ["breadboard", "Breadboard 170-Tie Point", "match"],
    ["IRF540", "IRF540N N-Channel MOSFET (100V, 28A)", "match"],
    ["DHT11", "Temperature & Humidity Sensor Module DHT-11 (SKU#KY015)", "match"],
    ["MPU6050", "MPU-6050 IMU Sensor Module with 6 DOF (Gyroscope, Accelerometer)", "match"],
    ["fuse holder", "Inline Round Glass Fuse Holder", "match"],
  ],
};

// Still wrong. The first ones are what a parts list buys: a different part at full marks, and
// cheaper than the real one.
const KNOWN_WRONG = [
  ["servo", "LA7116 VCR Servo Interface IC DIP 24", "weak"],
  ["16x2 LCD", "LCD16x2 Serial interface I2C Board Module", "weak"],
  ["4 channel relay module", "IR Tracking Sensor Module 4 Channel", "weak"],
  ["10k potentiometer", "Variable Resistor - POT (10 K-Ohm) - 3296W", "match"],
];

for (const [rule, cases] of Object.entries(CASES)) {
  test(rule, () => {
    for (const [query, name, want] of cases) {
      const s = score(query, name);
      assert.equal(verdict(s), want, `"${query}" ~ "${name}" scored ${s}`);
    }
  });
}

for (const [query, name, want] of KNOWN_WRONG) {
  test.todo(`"${query}" ~ "${name}" is ${want}`, () => {
    assert.equal(verdict(score(query, name)), want);
  });
}

test("a weak match says why", () => {
  assert.equal(weakReason("10k resistor", "Variable Resistor - POT (10 K-Ohm) - 3296W"), "A potentiometer, not a fixed resistor");
  assert.equal(weakReason("Arduino UNO", "Acrylic case for Arduino UNO"), "Made for it, not the part itself");
  assert.equal(weakReason("LM7805", "LM7812 Voltage Regulator"), "No “lm7805” in its name");
});

test("pack sizes", () => {
  assert.equal(packSize("1N4007 Diode (10pcs)"), 10);
  assert.equal(packSize("Jumper Wires Pack of 40"), 40);
  assert.equal(packSize("LED 5mm Red 20 Pieces"), 20);
  assert.equal(packSize("Resistor Kit 600pcs 30 values"), 1);
  assert.equal(packSize("ESP32 Development Board"), 1);
});

test("search variants for literal shop search", () => {
  assert.ok(searchVariants("LM7805").includes("7805"));
  assert.ok(searchVariants("5010 fan").includes("5010"));
  assert.ok(searchVariants("16x2 LCD").includes("1602 lcd"));
  assert.ok(searchVariants("Mini-360").includes("mini360"));
});

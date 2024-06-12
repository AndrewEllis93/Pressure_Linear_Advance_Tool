/**
 * Pressure Advance Calibration Pattern
 * Copyright (C) 2019 Sineos [https://github.com/Sineos]
 * Copyright (C) 2022 AndrewEllis93 [https://github.com/AndrewEllis93]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
'use strict';

const PA_round = -4;
const Z_round = -3;
const XY_round = -4;
const EXT_round = -5;

const GLYPH_PADDING_HORIZONTAL = 1;
const GLYPH_PADDING_VERTICAL = 1;

const ENCROACHMENT = 1/3;

const State = {
  cur_x: 0.0,
  cur_y: 0.0,
  cur_z: 0.0,
  retracted: false,
  hopped: false,
  pa_script: "",
};

const START_GCODES = {
  klipper: `
    PRINT_START ; Start macro
    ; START_PRINT ; Start macro (alternate / official start macro name)
  `,
  rrf3: `
    G28                 ; Home all axes
    G90                 ; Absolute XYZ
    G1 Z5 F100          ; Z raise
    M190 S[BED_TEMP]    ; Set & wait for bed temp.
    M109 S[HOTEND_TEMP] ; Set & wait for hotend temp.
    G32                 ; Run bed.g macro
    G28 Z               ; Home Z
  `,
  marlin1_1_9: `
    G28                 ; Home all axes
    G90                 ; Absolute XYZ
    G1 Z5 F100          ; Z raise
    M190 S[BED_TEMP]    ; Set & wait for bed temp
    M109 S[HOTEND_TEMP] ; Set & wait for hotend temp
    ;G29                ; Auto bed leveling
  `,
  marlin1_1_8: `
    G28                 ; Home all axes
    G90                 ; Absolute XYZ
    G1 Z5 F100          ; Z raise
    M190 S[BED_TEMP]    ; Set & wait for bed temp
    M109 S[HOTEND_TEMP] ; Set & wait for hotend temp
    ;G29                ; Auto bed leveling
  `,
};

const END_GCODES = {
  klipper: `PRINT_END ; End macro. Change name to match yours`,
  rrf3: `M0 ; Stop`,
  marlin1_1_9: `M501 ; Load settings from EEPROM (to restore previous values)`,
  marlin1_1_8: `M501 ; Load settings from EEPROM (to restore previous values)`,
};

const Settings = {
  // increment to invalidate saved settings
  settings_version: 3,

  acceleration: 750,
  acceleration_enable: false,
  anchor_layer_line_ratio: 140,
  anchor_option: "anchor_frame",
  anchor_perimeters: 4,
  bed_shape: "Rect",
  bed_temp: 60,
  bed_x: 200,
  bed_y: 200,
  corner_angle: 90,
  echo: true,
  end_gcode: "",
  expert_mode: false,
  ext_mult: 0.98,
  extruder_name: "",
  extruder_name_enable: false,
  fan_speed: 100,
  fan_speed_firstlayer: 0,
  filament: null,
  filament_diameter: 1.75,
  filename: "pa_pattern",
  firmware: "klipper",
  fw_retract: false,
  height_firstlayer: 0.25,
  height_layer: 0.2,
  hotend_temp: 200,
  line_ratio: 112.5,
  lineno_no_leading_zero: false,
  nozzle_diameter: 0.4,
  num_layers: 4,
  origin_center: false,
  pa_end: 0.08,
  pa_smooth: false,
  pa_start: 0,
  pa_step: 0.005,
  pattern_options_enable: false,
  pattern_spacing: 2,
  print_dir: 0,
  printer: null,
  retract_dist: 0.5,
  speed_firstlayer: 30,
  speed_perimeter: 100,
  speed_retract: 35,
  speed_travel: 120,
  speed_unretract: 35,
  start_gcode: "",
  start_gcode_no_heating: false,
  start_gcode_no_homing: false,
  tool_index: 0,
  use_lineno: true,
  wall_count: 3,
  wall_side_length: 30.0,
  zhop_enable: true,
  zhop_height: 0.1,

  applyLsSettings() {
    // Get localStorage data
    let lsSettings = window.localStorage.getItem("PA_SETTINGS");

    if (lsSettings) {
      let localSettings = jQuery.parseJSON(lsSettings);
      if (
        localSettings["settings_version"] == DEFAULT_SETTINGS.settings_version
      ) {
        // only populate form with saved settings if version matches current
        Object.assign(config, localSettings);
      }
    }
  },

  /**
   * Write out the current values to the HTML form
   */
  writeValuesToForm() {
    for (const property in this) {
      let inputField = $(`#${property.toUpperCase()}`);
      if (typeof this[property] === "boolean") {
        inputField.prop("checked", this[property]);
      } else {
        inputField.val(this[property]);
      }
    }
  },

  /**
   * Monitor the HTML page for input parameter changes
   */
  attachForm() {
    this.applyLsSettings();
    this.writeValuesToForm();
    $("[data-settings]").on("blur change", (event) => {
      this.onChange(event);
    });
  },

  /**
   * Process the changed field
   */
  onChange(event) {
    event.preventDefault();

    let elem = $(event.target);
    let prop_name = elem.attr("id").toLowerCase();

    // Ignore unknown settings
    if (typeof Object.getPrototypeOf(this)[prop_name] === "undefined") {
      return;
    }

    if (elem.is(":checkbox")) {
      this[prop_name] = elem.is(":checked");
      let state = this[prop_name] ? "" : "disabled";
      //$(`[data-toggle-${prop_name}]`).prop("disabled", state);
    } else {
      switch (typeof this[prop_name]) {
        case "number":
          let value = elem.val();
          if (value.toString().trim() === "" || typeof value === "undefined") {
            // Set to NaN (Not a Number) to show validation failure
            this[prop_name] = NaN;
            break;
          }
          this[prop_name] = Number(value);
          break;
        default:
          this[prop_name] = elem.val().toString();
          break;
      }
    }

    let updateRender = typeof elem.data("render") !== "undefined";
    switch (elem.attr("id")) {
      case "ACCELERATION_ENABLE":
        toggleAcceleration();
      case "FIRMWARE":
        toggleFirmwareOptions();
        toggleFirmwareValues();
        toggleSEGcode();
        break;
      case "BED_SHAPE":
        toggleBedShape();
        break;
      case "ANCHOR_OPTION":
        toggleAnchorOptions();
        break;
      case "EXPERT_MODE":
        toggleExpertMode();
        break;
      case "EXTRUDER_NAME_ENABLE":
        toggleExtruderName();
        break;
      case "ZHOP_ENABLE":
        toggleZHop();
        break;
      case "PATTERN_OPTIONS_ENABLE":
        togglePatternOptions();
        break;
      case "USE_LINENO":
        toggleLeadingZero();
        break;
      case "LINENO_NO_LEADING_ZERO":
      case "FW_RETRACT":
        toggleFwRetract();
        break;
      case "START_GCODE_NO_HOMING":
        previewStartGcode();
        break;
      case "START_GCODE_NO_HEATING":
        previewStartGcode();
        break;
      case "START_GCODE":
        previewStartGcode();
        break;
      default:
        break;
    }
    validate(updateRender);
  },

  startGCode(replace = false) {
    let gcode = this.start_gcode
      ? this.start_gcode
      : START_GCODES[this.firmware];

    // Dedent text block if needed
    gcode = gcode.replace(/^\n/, "");
    let match = gcode.match(/^\s+/);
    if (match) {
      gcode = gcode.replace(new RegExp("^" + match[0], "gm"), "");
    }

    // Return early if placeholders don't need to be replaced
    if (!replace) {
      return gcode;
    }

    // Remove 0 temps
    gcode = gcode.replace(/M104 S0.*?\n/g, "");
    gcode = gcode.replace(/M140 S0.*?\n/g, "");
    gcode = gcode.replace(/M109 S0.*?\n/g, "");
    gcode = gcode.replace(/M190 S0.*?\n/g, "");

    // Add M109 / M190 if user didn't add & didn't opt out
    if (!config.start_gcode_no_heating) {
      if (!gcode.match(/\[HOTEND_TEMP\]/g)) {
        if (!gcode.match(/G28(?! Z)/gm)) {
          // If user does not have a G28
          gcode = `M109 S[HOTEND_TEMP] ; Set & wait for hotend temp\n${gcode}`; // Prepend. Variable will get replaced below
        } else {
          gcode = gcode.replace(
            /G28(?! Z).*?\n/gm,
            `$&M109 S[HOTEND_TEMP] ; Set & wait for hotend temp\n`
          ); // Insert below user's G28 instead. Variable will get replaced below
        }
      }
      if (!gcode.match(/\[BED_TEMP\]/g)) {
        if (!gcode.match(/G28(?! Z)/gm)) {
          // If user does not have a G28
          gcode = `M190 S[BED_TEMP] ; Set & wait for bed temp\n${gcode}`; // Prepend. Variable will get replaced below
        } else {
          gcode = gcode.replace(
            /G28(?! Z).*?\n/gm,
            `$&M190 S[BED_TEMP] ; Set & wait for bed temp\n`
          ); // Insert below user's G28 instead. Variable will get replaced below
        }
      }
    }

    // Prepend G28 if user didn't add & didn't opt out
    if (!config.start_gcode_no_homing) {
      if (!gcode.match(/G28(?! Z)/gm)) {
        gcode = `G28 ; Home all axes\n${gcode}`;
      }
    }

    // Prepend exclude_object metadata if firmware is klipper
    if(this.firmware == 'klipper') {
      const xmin = Math.floor(this.patternStartX());
      const ymin = Math.floor(this.patternStartY());
      const xmax = Math.ceil(this.patternStartX() + this.printSizeX());
      const ymax = Math.ceil(this.patternStartY() + this.printSizeY());
      gcode = `EXCLUDE_OBJECT_DEFINE NAME=pressure_advance_calibration CENTER=${(xmin+xmax)/2},${(ymin+ymax)/2} POLYGON=[[${xmin},${ymin}],[${xmin},${ymax}],[${xmax},${ymax}]]\n${gcode}`;
    }

    // Replace user variables/placeholders with real values
    return (
      gcode
        .replace(/\[HOTEND_TEMP\]/g, this.hotend_temp)
        .replace(/\[BED_TEMP\]/g, this.bed_temp)
        .replace(/\[EXTRUDER_NAME\]/g, this.extruder_name)
        .replace(/\[TOOL_INDEX\]/g, this.tool_index)

        // PS / SS native variables
        .replace(/{first_layer_temperature.*?}/g, this.hotend_temp)
        .replace(/\[first_layer_temperature.*?\]+/g, this.hotend_temp) // will also match nested variables like "[first_layer_temperature[initial_extruder]]"
        .replace(/{first_layer_bed_temperature.*?}/g, this.bed_temp)
        .replace(/\[first_layer_bed_temperature.*?\]+/g, this.bed_temp)
        .replace(/{chamber_temperature.*?}/g, 0)
        .replace(/\[chamber_temperature.*?\]+/g, 0)

        // OrcaSlicer native variables
        .replace(/{nozzle_temperature_initial_layer.*?}/g, this.hotend_temp)
        .replace(/\[nozzle_temperature_initial_layer.*?\]+/g, this.hotend_temp)
        .replace(/{bed_temperature_initial_layer_single.*?}/g, this.bed_temp)
        .replace(/\[bed_temperature_initial_layer_single.*?\]+/g, this.bed_temp)
        //.replace(/{chamber_temperature.*?}/g, 0) // same as PS/SS, no need to replace again
        //.replace(/\[chamber_temperature.*?\]+/g, 0) // same as PS/SS, no need to replace again

        // Cura native variables
        .replace(/{material_print_temperature.*?}/g, this.hotend_temp)
        .replace(/{material_bed_temperature.*?}/g, this.bed_temp)
        .replace(/{build_volume_temperature.*?}/g, 0)

        .trim()
    );
  },

  endGCode() {
    let gcode = this.end_gcode ? this.end_gcode : END_GCODES[this.firmware];

    return gcode.trim();
  },

  /**
   * Getters for calculated properties
   */

  /**
   * Helper to determine handle Marlin specific macros
   * @returns string
   */

  bedX() {
    return this.bed_x;
  },

  bedY() {
    if (this.bed_shape === "Round") {
      return this.bedX();
    }

    return this.bed_y;
  },

  originCenter() {
    if (this.bed_shape === "Round") {
      return true;
    }

    if (!this.expert_mode) {
      if (this.bed_shape === "Rect") {
        return false;
      }
    }

    return this.origin_center;
  },

  numLayers() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.num_layers;
    }

    return this.num_layers;
  },

  wallCount() {
    if (!this.pattern_options_enable) {
      return DEFAULT_SETTINGS.wall_count;
    }

    return this.wall_count;
  },

  wallSideLength() {
    if (!this.pattern_options_enable) {
      return DEFAULT_SETTINGS.wall_side_length;
    }

    return this.wall_side_length;
  },

  patternSpacing() {
    if (!this.pattern_options_enable) {
      return DEFAULT_SETTINGS.pattern_spacing;
    }

    return this.pattern_spacing;
  },

  cornerAngle() {
    if (!this.pattern_options_enable) {
      return DEFAULT_SETTINGS.corner_angle;
    }

    return this.corner_angle;
  },

  printDir() {
    if (!this.pattern_options_enable) {
      return DEFAULT_SETTINGS.print_dir;
    }

    return this.print_dir;
  },

  extruderNameEnable() {
    if (!this.expert_mode) {
      return false;
    }

    return this.extruder_name_enable;
  },

  toolIndex() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.tool_index;
    }

    return this.extruder_name_enable;
  },

  lineRatio() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.line_ratio;
    }

    return this.line_ratio;
  },

  lineRatioAnchor() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.anchor_layer_line_ratio;
    }

    return this.anchor_layer_line_ratio;
  },
  anchorPerimeters() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.anchor_perimeters;
    }

    return this.anchor_perimeters;
  },
  fwRetract() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.fw_retract;
    }

    return this.fw_retract;
  },
  useLineNo() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.use_lineno;
    }

    return this.use_lineno;
  },
  lineNoNoLeadingZero() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.lineno_no_leading_zero;
    }

    return this.lineno_no_leading_zero;
  },
  showLcd() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.echo;
    }

    return this.echo;
  },
  paSmooth() {
    if (!this.expert_mode) {
      return DEFAULT_SETTINGS.pa_smooth;
    }

    return this.pa_smooth;
  },

  // Speed settings
  speedFirstLayer() {
    return this.speed_firstlayer * 60;
  },
  speedPerimeter() {
    return this.speed_perimeter * 60;
  },
  speedTravel() {
    return this.speed_travel * 60;
  },
  speedRetract() {
    return this.speed_retract * 60;
  },
  speedUnretract() {
    return this.speed_unretract * 60;
  },
  extruderName() {
    return this.extruder_name.trim();
  },

  numPatterns() {
    return Math.round((this.pa_end - this.pa_start) / this.pa_step + 1);
  },
  // Line widths
  lineWidth() {
    return (this.nozzle_diameter * this.lineRatio()) / 100;
  },
  lineWidthAnchor() {
    return (this.nozzle_diameter * this.lineRatioAnchor()) / 100;
  },
  // Line spacings
  lineSpacing() {
    // from slic3r documentation: spacing = extrusion_width - layer_height * (1 - PI/4)
    return this.lineWidth() - this.height_layer * (1 - Math.PI / 4);
  },
  lineSpacingAnchor() {
    // from slic3r documentation: spacing = extrusion_width - layer_height * (1 - PI/4)
    return this.lineWidthAnchor() - this.height_firstlayer * (1 - Math.PI / 4);
  },
  lineSpacingAngle() {
    return this.lineSpacing() / Math.sin(toRadians(this.cornerAngle()) / 2);
  },

  // Dimensions
  centerX() {
    return this.originCenter() ? 0 : this.bedX() / 2;
  },
  centerY() {
    return this.originCenter() ? 0 : this.bedY() / 2;
  },
  objectSizeX() {
    let size = Math.round10(
      this.numPatterns() * ((this.wallCount() - 1) * this.lineSpacingAngle()) +
        (this.numPatterns() - 1) * (this.patternSpacing() + this.lineWidth()) +
        Math.cos(toRadians(this.cornerAngle()) / 2) * this.wallSideLength(),
      XY_round
    );

    // frame is grown to the right with anchor frame enabled,
    // to prevent last pattern from running over it
    if (this.anchor_option === "anchor_frame") {
      size += this.lineSpacingAnchor() * this.anchorPerimeters();
    }

    return size; // TODO: Needs be put back somewhere in the gcode generation + this.patternShift();
  },
  objectSizeY() {
    // hypotenuse of given angle
    let size = Math.round10(
      2 * (Math.sin(toRadians(this.cornerAngle()) / 2) * this.wallSideLength()),
      XY_round
    );
    size +=
      getMaxNumberingHeight(this.lineNoNoLeadingZero()) +
      GLYPH_PADDING_VERTICAL * 2 +
      this.lineWidthAnchor();

    return size;
  },
  frameSizeY() {
    return (
      Math.sin(toRadians(this.cornerAngle() / 2)) * this.wallSideLength() * 2
    );
  },
  patternStartX() {
    return this.centerX() - (this.objectSizeX() + this.patternShift()) / 2;
  },
  patternStartY() {
    return this.centerY() - this.objectSizeY() / 2;
  },
  patternShift() {
    if (!this.useLineNo()) {
      return 0;
    }

    let shift =
      this.centerX() -
      this.objectSizeX() / 2 -
      this.glyphStartX() +
      GLYPH_PADDING_HORIZONTAL;
    if (shift > 0) {
      return shift + this.lineWidthAnchor() / 2;
    }
    return 0;
  },

  printSizeX() {
    return this.objectSizeX() + this.patternShift();
  },
  printSizeY() {
    return this.objectSizeY();
  },
  // Calculated properties used for line numbers
  // TODO: Might need conditional returns
  glyphStartX() {
    if (!this.useLineNo()) {
      return 0.0;
    }
    return (
      this.centerX() -
      this.objectSizeX() / 2 +
      (((this.wallCount() - 1) / 2) * this.lineSpacingAngle() - 2)
    );
  },
  glyphEndX() {
    return (
      this.centerX() -
      this.objectSizeX() / 2 +
      (this.numPatterns() - 1) * (this.patternSpacing() + this.lineWidth()) +
      (this.numPatterns() - 1) *
        ((this.wallCount() - 1) * this.lineSpacingAngle()) +
      4
    );
  },
  glyphTabMaxX() {
    return (
      this.glyphEndX() + GLYPH_PADDING_HORIZONTAL + this.lineWidthAnchor() / 2
    );
  },

  // real world print size, accounting for rotation and line widths.
  // this is just used to ensure it will fit on the print bed during input validation
  // actual gcode rotation is done during gcode generation
  fitWidth() {
    // actual size is technically + one line width in each direction,
    // as it squishes outwards
    // this is probably overkill
    let width = this.printSizeX() + this.lineWidth();
    return (
      Math.abs(this.printSizeX() * Math.cos(toRadians(this.printDir()))) +
      Math.abs(this.printSizeY() * Math.sin(toRadians(this.printDir())))
    ); // rotate by PRINT_DIR
  },
  fitHeight() {
    let height = this.printSizeY() + this.lineWidth();
    return (
      Math.abs(this.printSizeX() * Math.sin(toRadians(this.printDir()))) +
      Math.abs(this.printSizeY() * Math.cos(toRadians(this.printDir())))
    );
  },
};

const DEFAULT_SETTINGS = Object.create(Settings);
// For now this needs to happen early as there are a lot of global
// code fragments needing this
let config = Object.create(Settings);
let state = Object.create(State)

function genGcode() {
  // Reset the state
  state = Object.create(State)

  let basicSettings = {
    'anchorLineWidth': config.lineWidthAnchor(),
    'anchorPerimeters': config.anchorPerimeters(),
    'centerX': config.centerX(),
    'centerY': config.centerY(),
    'encroachment': ENCROACHMENT,
    'extMult': config.ext_mult,
    'extruderName': config.extruderName(),
    'filamentDiameter': config.filament_diameter,
    'firstLayerHeight': config.height_firstlayer,
    'firstLayerSpeed': config.speedFirstLayer(),
    'fwRetract': config.fwRetract(),
    'layerHeight': config.height_layer,
    'lineWidth': config.lineWidth(),
    'moveSpeed': config.speedTravel(),
    'numPatterns': config.numPatterns(),
    'paEnd': config.pa_end,
    'paStart': config.pa_start,
    'paStep': config.pa_step,
    'paSmooth': config.paSmooth(),
    'perimSpeed': config.speedPerimeter(),
    'printDir': config.printDir(),
    'retractDist': config.retract_dist,
    'retractSpeed': config.speedRetract(),
    'unretractSpeed': config.speedUnretract(),
    'zhopEnable': config.zhop_enable,
    'zhopHeight': config.zhop_height,
  };

  // Start G-code for pattern
  state.pa_script = `
; ### Ellis' Pressure Advance / Linear Advance Calibration Tool ###
;
; Original Marlin linear advance calibration tool by Sineos [https://github.com/Sineos]
; Heavily modified/rewritten by Andrew Ellis [https://github.com/AndrewEllis93]
;
; -------------------------------------------
; Generated: ${new Date()}
; -------------------------------------------
;
; Advanced Mode: ${config.expert_mode}
;
; Printer:
;  - Firmware: ${config.firmware}
;  - Bed Shape: ${config.bed_shape}
${(config.bed_shape === 'Round' ? `;  - Bed Diameter: ${config.bedX()} mm\n`: `;  - Bed Size X: ${config.bedX()} mm\n`)}\
${(config.bed_shape === 'Round' ? '': `;  - Bed Size Y: ${config.bedY()} mm\n`)}\
;  - Origin Bed Center: ${(config.originCenter() ? 'true': 'false')}
${(config.expert_mode && config.firmware == 'klipper' && config.extruderNameEnable() ? `;  - Extruder Name: ${config.extruderName()}\n` : '')}\
${(config.expert_mode && config.firmware == 'klipper' && !config.extruderNameEnable() ? `;  - Extruder Name: Disabled\n` : '')}\
${(config.expert_mode && config.firmware != 'klipper' && config.toolIndex() != 0 ? `;  - Tool Index: ${config.toolIndex()}\n` : '')}\
${(config.expert_mode && config.firmware != 'klipper' && config.toolIndex() == 0 ? `;  - Tool Index: Disabled (0)\n` : '')}\
;  - Travel Speed: ${config.speed_travel} mm/s
;  - Nozzle Diameter: ${config.nozzle_diameter} mm
;  - Filament Diameter: ${config.filament_diameter} mm
;  - Extrusion Multiplier: ${config.ext_mult}
;
; Retraction / Z Hop:
${(config.expert_mode ? `;  - Firmware Retraction: ${config.fwRetract()}\n` : '')}\
${(!config.fwRetract() ? `;  - Retraction Distance: ${config.retract_dist} mm\n` : '')}\
${(!config.fwRetract() ? `;  - Retract Speed: ${config.speed_retract} mm/s\n` : '')}\
${(!config.fwRetract() ? `;  - Unretract Speed: ${config.speed_unretract} mm/s\n` : '')}\
;  - Z Hop Enable: ${config.zhop_enable}
${(config.zhop_enable ? `;  - Z Hop Height: ${config.zhop_height}mm\n`: '')}\
;
; First Layer Settings:
;  - First Layer Height: ${config.height_firstlayer} mm
;  - First Layer Printing Speed: ${config.speed_firstlayer} mm/s
;  - First Layer Fan Speed: ${config.fan_speed_firstlayer}%
;  - Anchor Option: ${config.anchor_option}
${(config.expert_mode && config.anchor_option == 'anchor_frame' ? `;  - Anchor Frame Perimeters: ${config.anchorPerimeters()}\n`: '')}\
${(config.expert_mode && config.anchor_option != 'no_anchor' ? `;  - Anchor Line Width: ${config.anchor_layer_line_ratio} %\n`: '')}\
;
; Print Settings:
${(config.expert_mode ? `;  - Line Width: ${config.lineRatio()} %\n`: '')}\
${(config.expert_mode ? `;  - Layer Count: ${config.numLayers()}\n` : '')}\
;  - Layer Height: ${config.height_layer} mm
;  - Print Speed: ${config.speed_perimeter} mm/s
;  - Acceleration: ${config.acceleration_enable ? `${config.acceleration} mm/s^2` : `Disabled`}
;  - Fan Speed: ${config.fan_speed}%
;
${(config.expert_mode ? `; Pattern Settings ${(!config.pattern_options_enable ? `(Using defaults)`: '`(Customized)`')}:\n` : '')}\
${(config.expert_mode ? `;  - Wall Count: ${config.wallCount()}\n` : '')}\
${(config.expert_mode ? `;  - Side Length: ${config.wallSideLength()} mm\n` : '')}\
${(config.expert_mode ? `;  - Spacing: ${config.patternSpacing()} mm\n` : '')}\
${(config.expert_mode ? `;  - Corner Angle: ${config.cornerAngle()} degrees \n` : '')}\
${(config.expert_mode ? `;  - Printing Direction: ${config.printDir()} degree\n` : '')}\
${(config.expert_mode ? ';\n' : '')}\
; Pressure Advance Stepping:
;  - ${(config.firmware == 'klipper' || config.firmware == 'rrf3' ? 'PA' : 'LA')} Start Value: ${Math.round10(config.pa_start, PA_round)}
;  - ${(config.firmware == 'klipper' || config.firmware == 'rrf3' ? 'PA' : 'LA')} End Value: ${config.pa_end}
;  - ${(config.firmware == 'klipper' || config.firmware == 'rrf3' ? 'PA' : 'LA')} Increment: ${config.pa_step}
${(config.expert_mode && config.firmware == 'klipper' ? `;  - Increment Smooth Time Instead: ${config.paSmooth()}\n` : '')}\
${(config.expert_mode ? `;  - Show on LCD: ${config.showLcd()}\n` : '')}\
${(config.expert_mode ? `;  - Number Tab: ${config.useLineNo()}\n` : '')}\
${(config.expert_mode ? `${(config.useLineNo() ? `;  - No Leading Zeroes: ${config.lineNoNoLeadingZero()}\n`: '')}` : '')}\
;
; Start / End G-code:
;  - Hotend Temp: ${config.hotend_temp}C
;  - Bed Temp: ${config.bed_temp}C
;  - Don't Add G28: ${config.start_gcode_no_homing}
;  - Don't Add Heating G-Codes: ${config.start_gcode_no_heating}
;  - Entered Start G-code: 
${config.startGCode(true).replace(/^/gm, ";       ")}
;  - Entered End G-code: 
${config.endGCode().replace(/^/gm, ";       ")}
;
; Calculated Values:
;  - Print Size X: ${Math.round10(config.fitWidth(), -2)} mm
;  - Print Size Y: ${Math.round10(config.fitHeight(), -2)} mm
;  - Number of Patterns to Print: ${config.numPatterns()}
;  - ${(config.firmware == 'klipper' || config.firmware == 'rrf3' ? 'PA' : 'LA')} Values: `;

for (let i = 0; i < config.numPatterns(); i++){
  state.pa_script += Math.round10((config.pa_start + i * config.pa_step),PA_round);
  if (i != config.numPatterns() - 1){ // add comma separator if not last item in list
    state.pa_script += ', '
  }
  else {
      state.pa_script += '\n'
  }
}

state.pa_script += `\
;
; Prepare printing
;
${(config.firmware == 'klipper' && config.extruder_name !== '' && config.extruder_name_enable ? `ACTIVATE_EXTRUDER EXTRUDER=${config.extruder_name} ; Activate extruder\n`: '')}\
${(config.firmware != 'klipper' && config.tool_index != 0 ? `T${config.tool_index} ; Activate extruder\n`: '')}\
${config.startGCode(true)}
G21 ; Millimeter units
G90 ; Absolute XYZ
M83 ; Relative E
G92 E0 ; Reset extruder distance
;
;  Begin printing
;
M106 S${Math.round(config.fan_speed_firstlayer * 2.55)} ${(config.firmware.includes('marlin') && config.tool_index != 0 ? ` P${config.tool_index} ` : '')}; Set fan speed
`;

if (config.acceleration_enable){
  if (config.firmware === 'klipper') {
    state.pa_script += `SET_VELOCITY_LIMIT ACCEL=${config.acceleration} ; Set printing acceleration\n`
  } else {
    state.pa_script += `M204 P${config.acceleration} ; Set printing acceleration\n`
  }
}

  // Move to layer height
  state.pa_script += retract('-', basicSettings, {hop: false}) +
                    moveToZ(5, basicSettings, {comment: 'Z raise'}) +
                    moveTo(config.patternStartX(), config.patternStartY(), basicSettings, {retract:false, hop:false, comment: 'Move to start position'}) +
                    moveToZ(config.height_firstlayer, basicSettings, {comment: 'Move to start layer height'}) +
                    retract('+', basicSettings, {hop: false})

  // Set initial PA             
  if (config.firmware == 'klipper'){
    state.pa_script += `SET_PRESSURE_ADVANCE ${(config.paSmooth() ? `SMOOTH_TIME=` : `ADVANCE=`)}${Math.round10(config.pa_start, PA_round)} ${(config.extruderName() != '' ? `EXTRUDER=${config.extruderName()} ` : '')}; Set pressure advance to start value\n`;
    if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start, PA_round)}\n`}
  }
  else if (config.firmware == 'marlin1_1_8' || config.firmware == 'marlin1_1_9'){
    state.pa_script += `M900 K${Math.round10(config.pa_start, PA_round)} ${(config.toolIndex() != 0 ? `T${config.toolIndex()} ` : '')}; Set linear advance k factor to start value\n`;
    if (config.showLcd()){state.pa_script += `M117 LA ${Math.round10(config.pa_start, PA_round)}\n`}
  }
  else if (config.firmware == 'rrf3'){
    state.pa_script += `M572 S${Math.round10(config.pa_start, PA_round)} ${(config.toolIndex() != 0 ? `D${config.toolIndex()} ` : '')}; Set pressure advance to start value\n`;
    if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start, PA_round)}\n`}
  }

  // create anchor + line numbering frame if selected
  if (config.anchor_option == 'anchor_frame'){
    state.pa_script += drawBox(config.patternStartX(), config.patternStartY(), config.printSizeX(), config.frameSizeY(), basicSettings);

    if (config.useLineNo()){ // create tab for numbers                                        // Set to <1 for extra overlap
      state.pa_script += drawBox(config.patternStartX(), (config.patternStartY() + config.frameSizeY() + (config.lineSpacingAnchor() * 1)), config.glyphTabMaxX() - config.patternStartX(), getMaxNumberingHeight(config.lineNoNoLeadingZero()) + config.lineSpacingAnchor() + GLYPH_PADDING_VERTICAL * 2, basicSettings, {fill: true, num_perims: config.anchorPerimeters()});
    }
  }
  else if (config.anchor_option == 'anchor_layer'){
    state.pa_script += drawBox(config.patternStartX(), config.patternStartY(), config.printSizeX(), config.frameSizeY(), basicSettings, {fill: true, num_perims: config.anchorPerimeters()});

    if (config.useLineNo()){ // create tab for numbers                                        // Set to <1 for extra overlap
      state.pa_script += drawBox(config.patternStartX(), (config.patternStartY() + config.frameSizeY() + (config.lineSpacingAnchor() * 1)), config.glyphTabMaxX() - config.patternStartX(), getMaxNumberingHeight(config.lineNoNoLeadingZero()) + config.lineSpacingAnchor() + GLYPH_PADDING_VERTICAL * 2, basicSettings, {fill: true});
    }
  }

  // draw PA pattern
  for (let i = (config.anchor_option == 'anchor_layer' ? 1 : 0); i < config.numLayers() ; i++){ // skip first layer if using full anchor layer

    if (i == 1){ // set new fan speed after first layer
      state.pa_script += `M106 S${Math.round(config.fan_speed * 2.55)} ${(config.firmware.includes('marlin') && config.toolIndex() != 0 ? ` P${config.toolIndex()} ` : '')}; Set fan speed\n`
    }

    state.pa_script += moveToZ((i * config.height_layer) + config.height_firstlayer, basicSettings, {comment: 'Move to layer height'});

    // line numbering, if selected
    if (config.useLineNo()){
      if ((config.anchor_option != 'no_anchor' && i == 1) || (config.anchor_option == 'no_anchor' && i == 0)){
                 
        if (config.firmware == 'klipper'){
          state.pa_script += `SET_PRESSURE_ADVANCE ${(config.paSmooth() ? `SMOOTH_TIME=` : `ADVANCE=`)}${Math.round10(config.pa_start, PA_round)} ${(config.extruderName() != '' ? `EXTRUDER=${config.extruderName()} ` : '')}; Set pressure advance to start value for numbering\n`;
          if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start, PA_round)}\n`}
        }
        else if (config.firmware == 'marlin1_1_8' || config.firmware == 'marlin1_1_9'){
          state.pa_script += `M900 K${Math.round10(config.pa_start, PA_round)} ${(config.toolIndex() != 0 ? `T${config.toolIndex()} ` : '')}; Set linear advance k factor to start value for numbering\n`;
          if (config.showLcd()){state.pa_script += `M117 LA ${Math.round10(config.pa_start, PA_round)}\n`}
        }
        else if (config.firmware == 'rrf3'){
          state.pa_script += `M572 S${Math.round10(config.pa_start, PA_round)} ${(config.toolIndex() != 0 ? `D${config.toolIndex()} ` : '')}; Set pressure advance to start value for numbering\n`;
          if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start, PA_round)}\n`}
        }

        for (let j = 0; j < config.numPatterns(); j++){
          if (j % 2 == 0){ // glyph on every other line
            let THIS_GLYPH_START_X = config.patternStartX() +
                (j * (config.patternSpacing() + config.lineWidth())) +
                (j * ((config.wallCount() - 1) * config.lineSpacingAngle())); // this aligns glyph starts with first pattern perim
            THIS_GLYPH_START_X += (((config.wallCount() - 1) / 2) * config.lineSpacingAngle()) -2; // shift glyph center to middle of pattern walls. 2 = half of glyph
            THIS_GLYPH_START_X += config.patternShift() // adjust for pattern shift

            state.pa_script += drawNumber(THIS_GLYPH_START_X, (config.patternStartY() + config.frameSizeY() + GLYPH_PADDING_VERTICAL + config.lineWidth()), basicSettings, Math.round10((config.pa_start + (j * config.pa_step)), PA_round), config.lineNoNoLeadingZero());
          }
        }
      }
    }

    let TO_X = config.patternStartX() + config.patternShift(),
        TO_Y = config.patternStartY(),
        SIDE_LENGTH = config.wallSideLength();

    if (i == 0 && config.anchor_option == 'anchor_frame'){ // if printing first layer with a frame, shrink to fit inside frame
      let SHRINK = (config.lineSpacingAnchor() * (config.anchorPerimeters() - 1) + (config.lineWidthAnchor() * (1 - ENCROACHMENT))) / Math.sin(toRadians(config.cornerAngle()) / 2);
      SIDE_LENGTH = config.wallSideLength() - SHRINK;
      TO_X += SHRINK * Math.sin(toRadians(90) - toRadians(config.cornerAngle()) / 2);
      TO_Y += config.lineSpacingAnchor() * (config.anchorPerimeters() - 1) + (config.lineWidthAnchor() * (1 - ENCROACHMENT));
    }

    let INITIAL_X = TO_X,
        INITIAL_Y = TO_Y;

    // move to start xy
    state.pa_script += moveTo(TO_X, TO_Y, basicSettings, {comment: 'Move to pattern start\n'})

    for (let j = 0; j < config.numPatterns(); j++){
      // increment pressure advance
      if (config.firmware == 'klipper'){
        state.pa_script += `SET_PRESSURE_ADVANCE ${(config.paSmooth() ? `SMOOTH_TIME=` : `ADVANCE=`)}${Math.round10(config.pa_start + (j * config.pa_step), PA_round)} ${(config.extruderName() != '' ? `EXTRUDER=${config.extruderName()} ` : '')}; Set pressure advance\n`;
        if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start + (j * config.pa_step), PA_round)}\n`}
      }
      else if (config.firmware == 'marlin1_1_8' || config.firmware == 'marlin1_1_9'){
        state.pa_script += `M900 K${Math.round10(config.pa_start + (j * config.pa_step), PA_round)} ${(config.toolIndex() != 0 ? `T${config.toolIndex()} ` : '')}; Set linear advance k factor\n`;
        if (config.showLcd()){state.pa_script += `M117 LA ${Math.round10(config.pa_start + (j * config.pa_step), PA_round)}\n`}
      }
      else if (config.firmware == 'rrf3'){
        state.pa_script += `M572 S${Math.round10(config.pa_start + (j * config.pa_step), PA_round)} ${(config.toolIndex() != 0 ? `D${config.toolIndex()} ` : '')}; Set pressure advance\n`;
        if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start + (j * config.pa_step), PA_round)}\n`}
      }

      for (let k = 0; k < config.wallCount() ; k++){
        TO_X += (Math.cos(toRadians(config.cornerAngle()) / 2) * SIDE_LENGTH);
        TO_Y += (Math.sin(toRadians(config.cornerAngle()) / 2) * SIDE_LENGTH);
        state.pa_script += drawLine(TO_X, TO_Y, basicSettings, {'height': (i == 0 ? config.height_firstlayer : config.height_layer), 'speed': (i == 0 ? config.speedFirstLayer() : config.speedPerimeter()), comment: 'Print pattern wall'});

        TO_X -= Math.cos(toRadians(config.cornerAngle()) / 2) * SIDE_LENGTH;
        TO_Y += Math.sin(toRadians(config.cornerAngle()) / 2) * SIDE_LENGTH;
        state.pa_script += drawLine(TO_X, TO_Y, basicSettings, {'height': (i == 0 ? config.height_firstlayer : config.height_layer), 'speed': (i == 0 ? config.speedFirstLayer() : config.speedPerimeter()), comment: 'Print pattern wall'});

        TO_Y = INITIAL_Y;
        switch (true){
          case k != config.wallCount() - 1:  // perims not done yet. move to next perim
            TO_X += config.lineSpacingAngle();
            state.pa_script += moveTo(TO_X, TO_Y, basicSettings, {comment: 'Move to start next pattern wall'});
            break;
          case j != config.numPatterns() - 1: // patterns not done yet. move to next pattern
            TO_X += (config.patternSpacing() + config.lineWidth());
            state.pa_script += moveTo(TO_X, TO_Y, basicSettings, {comment: 'Move to next pattern'});
            break;
          case i != config.numLayers() - 1: // layers not done yet. move back to start
            TO_X = INITIAL_X;
            state.pa_script += moveTo(TO_X, TO_Y, basicSettings, {comment: 'Move back to start position'});
            break;
          default:  // everything done. break
            break;
        }
      }
    }
  }

  if (config.firmware == 'klipper'){
    state.pa_script += `SET_PRESSURE_ADVANCE ${(config.paSmooth() ? `SMOOTH_TIME=` : `ADVANCE=`)}${Math.round10(config.pa_start, PA_round)} ${(config.extruderName() != '' ? `EXTRUDER=${config.extruderName()} ` : '')}; Set pressure advance back to start value\n`;
    if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start, PA_round)}\n`}
  }
  else if (config.firmware == 'marlin1_1_8' || config.firmware == 'marlin1_1_9'){
    state.pa_script += `M900 K${Math.round10(config.pa_start, PA_round)} ${(config.toolIndex() != 0 ? `T${config.toolIndex()} ` : '')}; Set linear advance k factor back to start value\n`;
    if (config.showLcd()){state.pa_script += `M117 LA ${Math.round10(config.pa_start, PA_round)}\n`}
  }
  else if (config.firmware == 'rrf3'){
    state.pa_script += `M572 S${Math.round10(config.pa_start, PA_round)} ${(config.toolIndex() != 0 ? `D${config.toolIndex()} ` : '')}; Set pressure advance back to start value\n`;
    if (config.showLcd()){state.pa_script += `M117 PA ${Math.round10(config.pa_start, PA_round)}\n`}
  }
  state.pa_script += retract('-', basicSettings) +
               moveToZ(state.cur_z + 5, basicSettings, {comment: 'Z raise'}) +`\
M104 S0 ; Turn off hotend
M140 S0 ; Turn off bed
M107    ; Turn off fan
;
; End G-code
;
${config.endGCode()}
;
; FINISH
;
`;

  $('#gcodetextarea').val(state.pa_script);
}

function getMaxNumberingHeight(removeLeadingZeroes = false){
  let sNumber = '',
      maxHeight = 0,
      curHeight = 0;

  for (let i = 0; i < config.numPatterns() ; i++){
    if (i % 2 == 0){
      curHeight = 0
      sNumber = (Math.round10((config.pa_start + (i * config.pa_step)), PA_round)).toString()
      if (removeLeadingZeroes){sNumber = sNumber.replace(/^0+\./, '.')}
      for (let j = 0; j < sNumber.length; j ++){
        if (!(sNumber.charAt(j) === '1' || sNumber.charAt(j) === '.')) {
          curHeight += 3 // glyph spacing
        }
      }
      if (curHeight > maxHeight){maxHeight = curHeight}
    }
  }
  return maxHeight;
}

// create digits for line numbering
function drawNumber(startX, startY, basicSettings, value, removeLeadingZeroes = false) {
  let glyphSegLength = 2,
      glyphDotSize = 0.75,
      glyphSpacing = 3.0,
      totalSpacing = 0,
      glyphString = '',
      sNumber = value.toString(),
      glyphSeg = {
        '1': ['bl','right','right'],
        '2': ['bl','up','right','down','right','up'],
        '3': ['bl','up','right','down','mup','right','down'],
        '4': ['ul','right','right','mleft','down','left'],
        '5': ['ul','down','right','up','right','down'],
        '6': ['ul','down','right','right','up','left','down'],
        '7': ['bl','up','right','right'],
        '8': ['bl','right','right','up','left','left','down','mright','up'],
        '9': ['br','up','left','left','down','right','up'],
        '0': ['bl','right','right','up','left','left','down'],
        '.': ['br','dot']
      };

  if (removeLeadingZeroes){sNumber = sNumber.replace(/^0+\./, '.')}

  for (let i = 0, len = sNumber.length; i < len; i += 1) { // loop through string chars
    for (let key in glyphSeg[sNumber.charAt(i)]) { // loop through segments corresponding to current char
      if(glyphSeg[sNumber.charAt(i)].hasOwnProperty(key)) {
        switch (true){
          case glyphSeg[sNumber.charAt(i)][key] === 'bl' :
            glyphString += moveTo(startX, startY + totalSpacing, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'br' :
            glyphString += moveTo(startX + glyphSegLength * 2, startY + totalSpacing, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'ul' :
            glyphString += moveTo(startX, startY + totalSpacing + glyphSegLength, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'ur' :
            glyphString += moveTo(startX + glyphSegLength * 2, startY + totalSpacing + glyphSegLength, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'up' :
            glyphString += drawLine(state.cur_x, state.cur_y + glyphSegLength, basicSettings, {'speed': basicSettings['firstLayerSpeed'], 'comment': 'Glyph: ' + sNumber.charAt(i)});
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'down' :
            glyphString += drawLine(state.cur_x, state.cur_y - glyphSegLength, basicSettings, {'speed': basicSettings['firstLayerSpeed'], 'comment': 'Glyph: ' + sNumber.charAt(i)});
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'right' :
            glyphString += drawLine(state.cur_x + glyphSegLength, state.cur_y,  basicSettings, {'speed': basicSettings['firstLayerSpeed'], 'comment': 'Glyph: ' + sNumber.charAt(i)});
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'left' :
            glyphString += drawLine(state.cur_x - glyphSegLength, state.cur_y, basicSettings, {'speed': basicSettings['firstLayerSpeed'], 'comment': 'Glyph: ' + sNumber.charAt(i)});
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'mup' :
            glyphString += moveTo(state.cur_x, state.cur_y + glyphSegLength, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'mdown' :
            glyphString += moveTo(state.cur_x, state.cur_y - glyphSegLength, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'mright' :
            glyphString += moveTo(state.cur_x + glyphSegLength, state.cur_y, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'mleft' :
            glyphString += moveTo(state.cur_x - glyphSegLength, state.cur_y, basicSettings);
            break;
          case glyphSeg[sNumber.charAt(i)][key] === 'dot' :
            glyphString += drawLine(state.cur_x - glyphDotSize, state.cur_y, basicSettings, {speed: basicSettings['firstLayerSpeed'], extMult: basicSettings['extMult'],comment: 'Glyph: .'});
        }
      }
    }
    if (sNumber.charAt(i) === '1' || sNumber.charAt(i) === '.') {
      totalSpacing += 1
    } else {
      totalSpacing += glyphSpacing
    }
  }
  return glyphString;
}


// Save content of textarea to file using
// https://github.com/eligrey/FileSaver.js
function saveTextAsFile() {
  if (state.pa_script) {
    let pa_script_blob = new Blob([state.pa_script], {type: 'text/plain'})
    saveAs(pa_script_blob, `${$('#FILENAME').val()}.gcode`);
  } else {
    alert('Generate G-code first');
  }
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
(function() {

  /**
   * Decimal adjustment of a number.
   *
   * @param {String}  type  The type of adjustment.
   * @param {Number}  value The number.
   * @param {Integer} exp   The exponent (the 10 logarithm of the adjustment base).
   * @returns {Number} The adjusted value.
   */

  function decimalAdjust(type, value, exp) {
    // If the exp is undefined or zero...
    if (typeof exp === 'undefined' || Number(exp) === 0) {
      return Math[type](value);
    }
    value = Number(value);
    exp = Number(exp);
    // If the value is not a number or the exp is not an integer...
    if (value === null || isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
      return NaN;
    }
    // If the value is negative...
    if (value < 0) {
      return -decimalAdjust(type, -value, exp);
    }
    // Shift
    value = value.toString().split('e');
    value = Math[type](Number(value[0] + 'e' + (value[1] ? (Number(value[1]) - exp) : -exp)));
    // Shift back
    value = value.toString().split('e');
    return Number(value[0] + 'e' + (value[1] ? (Number(value[1]) + exp) : exp));
  }

  // Decimal round
  if (!Math.round10) {
    Math.round10 = function(value, exp) {
      return decimalAdjust('round', value, exp);
    };
  }
  // Decimal floor
  if (!Math.floor10) {
    Math.floor10 = function(value, exp) {
      return decimalAdjust('floor', value, exp);
    };
  }
  // Decimal ceil
  if (!Math.ceil10) {
    Math.ceil10 = function(value, exp) {
      return decimalAdjust('ceil', value, exp);
    };
  }
}());

// get the number of decimal places of a float
function getDecimals(num) {
  let match = (String(num)).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) {
    return num;
  }
  let decimalPlaces = Math.max(0, (match[1] ? match[1].length : 0) - (match[2] ? Number(match[2]) : 0));
  return decimalPlaces;
}

// convert degrees to radians
function toRadians(degrees){
  return degrees * (Math.PI / 180);
}

// return distance between two points
function getDistance(cur_x, cur_y, to_x, to_y){
  return Math.hypot((to_x - cur_x), (to_y - cur_y));
}

// print a line between current position and target
function drawLine(to_x, to_y, basicSettings, optional) {
  let ext = 0,
      length = 0,
      gcode = '';

  //handle optional function arguments passed as object
  let defaults = {
    extMult: basicSettings['extMult'],
    height: basicSettings['layerHeight'],
    lineWidth: basicSettings['lineWidth'],
    speed: basicSettings['perimSpeed'],
    comment: 'Print line'
  };
  let optArgs = $.extend({}, defaults, optional);

  length = getDistance(state.cur_x, state.cur_y, to_x, to_y);

  let extArea = ((optArgs['lineWidth'] - optArgs['height']) * optArgs['height']) + (Math.PI * Math.pow((optArgs['height'] / 2), 2)) // cross sectional area of extrusion
  let vol = length * extArea // total volume of extrusion
  let filArea = Math.PI * Math.pow((basicSettings['filamentDiameter'] / 2), 2) // cross sectional area of filament
  ext = Math.round10((vol / filArea) * optArgs['extMult'], EXT_round) // volume to filament length

  gcode += `G1 X${Math.round10(rotateX(to_x, basicSettings['centerX'], to_y, basicSettings['centerY'], basicSettings['printDir']), XY_round)} Y${Math.round10(rotateY(to_x, basicSettings['centerX'], to_y, basicSettings['centerY'], basicSettings['printDir']), XY_round)} E${ext} F${optArgs['speed']} ; ${optArgs['comment']}\n`

  state.cur_x = to_x, // update global position vars
  state.cur_y = to_y;

  return gcode;
}

// move print head to coordinates
function moveTo(to_x, to_y, basicSettings, optional) {
  let gcode = '',
    distance = getDistance(state.cur_x, state.cur_y, to_x, to_y);

  let defaults = {
    comment: 'Move',
    hop: basicSettings['zhopEnable'],
    retract: true
  };
  let optArgs = $.extend({}, defaults, optional);

  if (to_x != state.cur_x || to_y != state.cur_y){ // don't do anything if we're already there

    if(distance > 2 && optArgs['retract']){ // don't retract for travels under 2mm
      gcode += retract('-', basicSettings, {hop: optArgs['hop']}); //retract
    }
    gcode += `G0 X${Math.round10(rotateX(to_x, basicSettings['centerX'], to_y, basicSettings['centerY'], basicSettings['printDir']), XY_round)} Y${Math.round10(rotateY(to_x, basicSettings['centerX'], to_y, basicSettings['centerY'], basicSettings['printDir']), XY_round)} F${basicSettings['moveSpeed']} ; ${optArgs['comment']}\n`

    state.cur_x = to_x, // update global position vars
    state.cur_y = to_y;

    if(distance > 2 && optArgs['retract']){
      gcode += retract('+', basicSettings, {hop: optArgs['hop']});  //unretract
    }
  }

  return gcode;
}

function moveToZ(to_z, basicSettings, optional){
  let gcode = '';

  let defaults = {
    comment: 'Move to Z'
  };
  let optArgs = $.extend({}, defaults, optional);

  gcode += `G0 Z${Math.round10(to_z, Z_round)} F${basicSettings['moveSpeed']} ; ${optArgs['comment']}\n`
  state.cur_z = to_z; // update global position var
  return gcode;
}

// create retract / un-retract gcode + zhop
function retract(dir, basicSettings, optional) {
  let gcode = '';

  let defaults = {
    hop: basicSettings['zhopEnable']
  };
  let optArgs = $.extend({}, defaults, optional);

  if (dir === '-'){
    if (!state.retracted){
      if (basicSettings['fwRetract']){
        gcode += `G10 ; Retract\n`;
      } else {
        gcode += `G1 E-${Math.round10(basicSettings['retractDist'], EXT_round)} F${basicSettings['retractSpeed']} ; Retract\n`;
      }
      state.retracted = true
    }
    if (optArgs['hop'] && !state.hopped){
      gcode += `G1 Z${Math.round10((state.cur_z + basicSettings['zhopHeight']), Z_round)} F${basicSettings['moveSpeed']} ; Z hop\n`
      state.hopped = true
    }
  } else if (dir === '+') {
    if (state.hopped){ // always return hop on unretract
      gcode += `G1 Z${Math.round10(state.cur_z, Z_round)} F${basicSettings['moveSpeed']} ; Z hop return\n`
      state.hopped = false
    }
    if (state.retracted){
      if (basicSettings['fwRetract']){
        gcode += `G11 ; Un-retract\n`
      } else {
        gcode += `G1 E${Math.round10(basicSettings['retractDist'], EXT_round)} F${basicSettings['unretractSpeed']} ; Un-retract\n`
      }
      state.retracted = false
    }
  }

  return gcode;
}

// draw perimeter, move inwards, repeat
function drawBox(min_x, min_y, size_x, size_y, basicSettings, optional){
  let gcode = '',
      x = min_x,
      y = min_y,
      max_x = min_x + size_x,
      max_y = min_y + size_y;

  //handle optional function arguments passed as object
  let defaults = {
    fill: false,
    num_perims: basicSettings['anchorPerimeters'],
    height: basicSettings['firstLayerHeight'],
    lineWidth: basicSettings['anchorLineWidth'],
    speed: basicSettings['firstLayerSpeed'],
  };

  let optArgs = $.extend({}, defaults, optional);

  let spacing = optArgs['lineWidth'] - optArgs['height'] * (1 - Math.PI / 4);

  // if number of perims exceeds size of box, reduce it to max
  let maxPerims = Math.min(
    // this is the equivalent of number of perims for concentric fill
    Math.floor(
      (size_x * Math.sin(toRadians(45))) / (spacing / Math.sin(toRadians(45)))
    ),
    Math.floor(
      (size_y * Math.sin(toRadians(45))) / (spacing / Math.sin(toRadians(45)))
    )
  );
  optArgs["num_perims"] = Math.min(optArgs["num_perims"], maxPerims);

  gcode += moveTo(min_x, min_y, basicSettings, {comment: 'Move to box start'});
1
  for (let i = 0; i < optArgs['num_perims'] ; i++){
    if (i != 0){ // after first perimeter, step inwards to start next perimeter
      x += spacing;
      y += spacing;
      gcode += moveTo(x, y, basicSettings, {comment: 'Step inwards to print next perimeter'})
    }
    // draw line up
    y += size_y - (i * spacing) * 2;
    gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Draw perimeter (up)'});
    // draw line right
    x += size_x - (i * spacing) * 2;
    gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Draw perimeter (right)'});
    // draw line down
    y -= size_y - (i * spacing) * 2;
    gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Draw perimeter (down)'});
    // draw line left
    x -= size_x - (i * spacing) * 2;
    gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Draw perimeter (left)'});
  }

  if (optArgs['fill']){
    const spacing_45 = spacing / Math.sin(toRadians(45)),
          xMinBound = min_x + ((spacing * (optArgs['num_perims'] - 1)) + (optArgs['lineWidth'] * (1 - basicSettings['encroachment']))),
          xMaxBound = max_x - ((spacing * (optArgs['num_perims'] - 1)) + (optArgs['lineWidth'] * (1 - basicSettings['encroachment']))),
          yMinBound = min_y + ((spacing * (optArgs['num_perims'] - 1)) + (optArgs['lineWidth'] * (1 - basicSettings['encroachment']))),
          yMaxBound = max_y - ((spacing * (optArgs['num_perims'] - 1)) + (optArgs['lineWidth'] * (1 - basicSettings['encroachment']))),
          xCount = Math.floor((xMaxBound - xMinBound) / spacing_45),
          yCount = Math.floor((yMaxBound - yMinBound) / spacing_45);

    let xRemainder = (xMaxBound - xMinBound) % spacing_45,
        yRemainder = (yMaxBound - yMinBound) % spacing_45;

    x = xMinBound
    y = yMinBound
    gcode += moveTo(x, y, basicSettings, {comment: 'Move to fill start'}) // move to start

    for (let i = 0; i < yCount + xCount + (xRemainder + yRemainder >= spacing_45 ? 1 : 0); i++){ // this isn't the most robust way, but less expensive than finding line intersections
      if (i < Math.min(yCount, xCount)){
        if (i % 2 == 0){
          x += spacing_45
          y = yMinBound
          gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step right
          y += (x - xMinBound)
          x = xMinBound
          gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print up/left
        } else {
          y += spacing_45
          x = xMinBound
          gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step up
          x += (y - yMinBound)
          y = yMinBound
          gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print down/right
        }
      } else if (i < Math.max(xCount,yCount)){
        if (xCount > yCount){ // if box is wider than tall
          if (i % 2 == 0){
            x += spacing_45
            y = yMinBound
            gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step right
            x -= yMaxBound - yMinBound
            y = yMaxBound
            gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print up/left
          } else {
            if (i == yCount){
              x += (spacing_45 - yRemainder)
              yRemainder = 0
            } else {
              x += spacing_45
            }
            y = yMaxBound
            gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step right
            x += yMaxBound - yMinBound
            y = yMinBound
            gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print down/right
          }
        } else { // if box is taller than wide
          if (i % 2 == 0){
            x = xMaxBound;
            if (i == xCount){
              y += (spacing_45 - xRemainder)
              xRemainder = 0
            } else {
              y += spacing_45
            }
            gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step up
            x = xMinBound
            y += xMaxBound - xMinBound
            gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print up/left
          } else {
            x = xMinBound
            y += spacing_45
            gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step up
            x = xMaxBound
            y -= xMaxBound - xMinBound
            gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print down/right
          }
        }
      } else {
        if (i % 2 == 0){
          x = xMaxBound;
          if (i == xCount){
            y += (spacing_45 - xRemainder)
          } else {
            y += spacing_45
          }
          gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step up
          x -= (yMaxBound - y)
          y = yMaxBound
          gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print up/left
        } else {
          if (i == yCount){
            x += (spacing_45 - yRemainder)
          } else {
            x += spacing_45
          }
          y = yMaxBound;
          gcode += moveTo(x, y, basicSettings, {speed: optArgs['speed']}) // step right
          y -= (xMaxBound - x)
          x = xMaxBound
          gcode += drawLine(x, y, basicSettings, {height: optArgs['height'], lineWidth: optArgs['lineWidth'], speed: optArgs['speed'], comment: 'Fill'}) // print down/right
        }
      }
    }
  }
  return gcode;
}

// rotate x around a defined center xm, ym
function rotateX(x, xm, y, ym, a) {
  a = toRadians(a); // Convert to radians
  let cos = Math.cos(a),
      sin = Math.sin(a);

  // Subtract midpoints, so that midpoint is translated to origin
  // and add it in the end again
  //let xr = (x - xm) * cos - (y - ym) * sin + xm; //CCW
  let xr = (cos * (x - xm)) + (sin * (y - ym)) + xm; //CW
  return xr;
}


// rotate y around a defined center xm, ym
function rotateY(x, xm, y, ym, a) {
  a = toRadians(a); // Convert to radians
  let cos = Math.cos(a),
      sin = Math.sin(a);

  // Subtract midpoints, so that midpoint is translated to origin
  // and add it in the end again
  //let yr = (x - xm) * sin + (y - ym) * cos + ym; //CCW
  let yr = (cos * (y - ym)) - (sin * (x - xm)) + ym; //CW
  return yr;
}

// save current settings as localStorage object
function setLocalStorage() {
  //const lsSettings = JSON.stringify(config, Object.getOwnPropertyNames(Settings)) // store all settings
  const lsSettings = JSON.stringify(config, Object.keys(config).concat(["settings_version"])); // store only modified + settings_version
  window.localStorage.setItem("PA_SETTINGS", lsSettings);
}

// toggle between round and rectangular bed shape
function toggleBedShape() {
  if (config.bed_shape === 'Round') {
    $('label[for=BED_X]').text('Bed Diameter:');
    $('label[for=BED_Y]').css({opacity: 0});
    $('#BED_Y').parent().css({opacity: 0});
    $('#BED_Y').prop('disabled', true);
    $('#ORIGIN_CENTER').prop('disabled', true);
    $('#ORIGIN_CENTER').parent().css({opacity: 0});
    $('label[for=ORIGIN_CENTER]').parent().css({opacity: 0});
  } else {
    $('label[for=\'BED_X\']').text('Bed Size X');
    $('label[for=BED_Y]').css({opacity: 1});
    $('#BED_Y').parent().css({opacity: 1});
    $('#BED_Y').prop('disabled', false);
    if ($('#EXPERT_MODE').is(':checked')){
    $('#ORIGIN_CENTER').prop('disabled', false);
    $('#ORIGIN_CENTER').parent().css({opacity: 1});
    $('label[for=ORIGIN_CENTER]').parent().css({opacity: 1});
    }
  }
}

function toggleSEGcode(){
  $('#START_GCODE').val(config.startGCode())
  $('#END_GCODE').val(config.endGCode())
  previewStartGcode();
}

function toggleAcceleration() {
  if ($("#ACCELERATION_ENABLE").is(":checked")) {
    $("#ACCELERATION").prop("disabled", false);
    if ($("#ACCELERATION").val() == "") {
      $("#ACCELERATION").val(DEFAULT_SETTINGS.acceleration);
    }
  } else {
    $("#ACCELERATION").val("");
    $("#ACCELERATION").prop("disabled", true);
  }
}

function toggleExtruderName() {
  if ($("#EXTRUDER_NAME_ENABLE").is(":checked")) {
    $("#EXTRUDER_NAME").prop("disabled", false);
  } else {
    $("#EXTRUDER_NAME").prop("disabled", true);
  }
}

function toggleExpertMode() {
  if ($("#EXPERT_MODE").is(":checked")) {
    $("#ORIGIN_CENTER").parents().eq(1).show();
    $("label[for=FW_RETRACT]").parent().css({ opacity: 1 });
    $("#FW_RETRACT").parent().css({ opacity: 1 });
    toggleFwRetract();
    $("#NUM_LAYERS").parents().eq(1).show();
    $("#LINE_RATIO").parents().eq(1).show();
    $("#patternSettingsHead").show();
    //$('label[for=PA_SMOOTH]').parent().css({opacity: 1});
    //$('#PA_SMOOTH').parent().css({opacity: 1});
    $("#USE_LINENO").parents().eq(1).show();
    $("#ECHO").parents().eq(1).show();
    toggleAnchorOptions();
    toggleFirmwareOptions();
  } else {
    $("#ORIGIN_CENTER").parents().eq(1).hide();
    $("label[for=FW_RETRACT]").parent().css({ opacity: 0 });
    $("#FW_RETRACT").parent().css({ opacity: 0 });
    toggleFwRetract();
    $("#NUM_LAYERS").parents().eq(1).hide();
    $("#LINE_RATIO").parents().eq(1).hide();
    $("#PATTERN_OPTIONS_ENABLE").prop("checked", false);
    togglePatternOptions();
    $("#patternSettingsHead").hide();
    $("label[for=PA_SMOOTH]").parent().css({ opacity: 0 });
    $("#PA_SMOOTH").parent().css({ opacity: 0 });
    $("#USE_LINENO").parents().eq(1).hide();
    $("#ECHO").parents().eq(1).hide();
    $("label[for=ANCHOR_PERIMETERS]").parent().hide();
    $("#ANCHOR_PERIMETERS").parent().hide();
    $("label[for=ANCHOR_LAYER_LINE_RATIO]").parent().hide();
    $("#ANCHOR_LAYER_LINE_RATIO").parent().hide();
  }
}

function toggleFirmwareOptions(){
  let firmware = $("#FIRMWARE").val();

  //$("#END_GCODE").val(END_GCODES[firmware]);

  switch (true) {
    case firmware == "klipper":
      $("label[for=TOOL_INDEX").parent().hide();
      $("#TOOL_INDEX").parent().hide();
      if ($("#EXPERT_MODE").is(":checked")) {
        $("label[for=EXTRUDER_NAME").parent().show();
        $("#EXTRUDER_NAME").parent().show();
        $("label[for=PA_SMOOTH]").parent().css({ opacity: 1 });
        $("#PA_SMOOTH").parent().css({ opacity: 1 });
      }
      $("#STEPPING_HEADER").html("Pressure Advance Stepping");
      $("#STEPPING_HEADER_BODY").html(`\
<i>Direct Drive: Start with ~0 to ~0.08 @ 0.005 increment<br>
Bowden: Start with ~0 to ~1* @ 0.05 increment<br>
<sup>*Long bowden paths can sometimes need higher than 1</sup><br></i>
Once you find a general range, run again with narrower range / finer increment.<br>`);
      $("label[for=PA_START]").html("PA Start Value");
      $("label[for=PA_END]").html("PA End Value");
      $("label[for=PA_STEP]").html("PA Increment");
      break;
    case firmware == "marlin1_1_9":
      if ($("#EXPERT_MODE").is(":checked")) {
        $("label[for=TOOL_INDEX").parent().show();
        $("#TOOL_INDEX").parent().show();
      }
      $("label[for=EXTRUDER_NAME").parent().hide();
      $("#EXTRUDER_NAME").parent().hide();
      $("#STEPPING_HEADER").html("Linear Advance Stepping");
      $("#STEPPING_HEADER_BODY").html(`\
<i>Direct Drive: Start with ~0 to ~0.08 @ 0.005 increment<br>
Bowden: Start with ~0 to ~1* @ 0.05 increment<br>
<sup>*Long bowden paths can sometimes need higher than 1</sup><br></i>
Once you find a general range, run again with narrower range / finer increment.<br>`);
      $("label[for=PA_START]").html("Start K Value");
      $("label[for=PA_END]").html("End K Value");
      $("label[for=PA_STEP]").html("K Value Increment");
      $("label[for=PA_SMOOTH]").parent().css({ opacity: 0 });
      $("#PA_SMOOTH").parent().css({ opacity: 0 });
      break;
    case firmware == "marlin1_1_8":
      if ($("#EXPERT_MODE").is(":checked")) {
        $("label[for=TOOL_INDEX").parent().show();
        $("#TOOL_INDEX").parent().show();
      }
      $("label[for=EXTRUDER_NAME").parent().hide();
      $("#EXTRUDER_NAME").parent().hide();
      $("#STEPPING_HEADER").html("Linear Advance Stepping");
      $("#STEPPING_HEADER_BODY").html(``);
      $("label[for=PA_START]").html("Start K Value");
      $("label[for=PA_END]").html("End K Value");
      $("label[for=PA_STEP]").html("K Value Increment");
      $("label[for=PA_SMOOTH]").parent().css({ opacity: 0 });
      $("#PA_SMOOTH").parent().css({ opacity: 0 });
      break;
    case firmware == "rrf3":
      if ($("#EXPERT_MODE").is(":checked")) {
        $("label[for=TOOL_INDEX").parent().show();
        $("#TOOL_INDEX").parent().show();
      }
      $("label[for=EXTRUDER_NAME").parent().hide();
      $("#EXTRUDER_NAME").parent().hide();
      $("#STEPPING_HEADER").html("Pressure Advance Stepping");
      $("#STEPPING_HEADER_BODY").html(`\
<i>Direct Drive: Start with ~0 to ~0.08 @ 0.005 increment<br>
Bowden: Start with ~0 to ~1* @ 0.05 increment<br>
<sup>*Long bowden paths can sometimes need higher than 1</sup><br></i>
Once you find a general range, run again with narrower range / finer increment.<br>`);
      $("label[for=PA_START]").html("PA Start Value");
      $("label[for=PA_END]").html("PA End Value");
      $("label[for=PA_STEP]").html("PA Increment");
      $("label[for=PA_SMOOTH]").parent().css({ opacity: 0 });
      $("#PA_SMOOTH").parent().css({ opacity: 0 });
      break;
  }
}

function toggleFirmwareValues() {
  config.start_gcode = ""; // clear to use default
  config.end_gcode = ""; // clear to use default

  if (config.firmware === "marlin1_1_8") {
    config.pa_start = 0;
    config.pa_end = 4;
    config.pa_step = 0.2;
  } else {
    config.pa_start = 0;
    config.pa_end = 0.08;
    config.pa_step = 0.005;
  }
}

function togglePatternOptions(){
  for (let i = 1; i < $('#patternSettingsHead').children().length; i++) {
    if ($('#PATTERN_OPTIONS_ENABLE').is(':checked')) {
      $('#patternSettingsHead').children().eq(i).show()
    } else {
      $('#patternSettingsHead').children().eq(i).hide()
    }
  }
}

function toggleAnchorOptions(){

    if ($('#ANCHOR_OPTION').val() == "anchor_frame"){
      if ($('#EXPERT_MODE').is(':checked')){
        $('label[for=ANCHOR_PERIMETERS]').parent().show();
        $('#ANCHOR_PERIMETERS').parent().show();
        $('label[for=ANCHOR_LAYER_LINE_RATIO]').parent().show();
        $('#ANCHOR_LAYER_LINE_RATIO').parent().show();
      }
      $('#anchorOptionDescription').html('<img style="width: auto; max-height: 150px;" src="./images/anchor_frame.png" alt="Anchor Frame" />')
    } else if ($('#ANCHOR_OPTION').val() == "anchor_layer") {
      if ($('#EXPERT_MODE').is(':checked')){
        $('label[for=ANCHOR_PERIMETERS]').parent().hide();
        $('#ANCHOR_PERIMETERS').parent().hide();
        $('label[for=ANCHOR_LAYER_LINE_RATIO]').parent().show();
        $('#ANCHOR_LAYER_LINE_RATIO').parent().show();
      }
      $('#anchorOptionDescription').html('<img style="width: auto; max-height: 150px;" src="./images/anchor_layer.png" alt="Anchor Layer" />')
    } else {
      $('label[for=ANCHOR_PERIMETERS]').parent().hide();
      $('#ANCHOR_PERIMETERS').parent().hide();
      $('label[for=ANCHOR_LAYER_LINE_RATIO]').parent().hide();
      $('#ANCHOR_LAYER_LINE_RATIO').parent().hide();
      $('#anchorOptionDescription').html('<img style="width: auto; max-height: 150px;" src="./images/no_anchor.png" alt="No Anchor" />')
    }
}

function toggleZHop() {
  if ($('#ZHOP_ENABLE').is(':checked')) {
    $('label[for=ZHOP_HEIGHT]').parent().show();
    $('#ZHOP_HEIGHT').parent().show();
  } else {
    $('label[for=ZHOP_HEIGHT]').parent().hide();
    $('#ZHOP_HEIGHT').parent().hide();
  }
}

    $('#ORIGIN_CENTER').prop('disabled', true);
    $('#ORIGIN_CENTER').parent().css({opacity: 0});

function toggleFwRetract() {
  if (!$('#FW_RETRACT').is(':checked') || !$('#EXPERT_MODE').is(':checked')) {
    $('label[for=SPEED_RETRACT]').parent().css({opacity: 1});
    $('#SPEED_RETRACT').css({opacity: 1});
    $('#SPEED_RETRACT').prop('disabled', false);
    $('label[for=SPEED_UNRETRACT]').parent().css({opacity: 1});
    $('#SPEED_UNRETRACT').css({opacity: 1});
    $('#SPEED_UNRETRACT').prop('disabled', false);
    $('label[for=RETRACT_DIST]').parent().css({opacity: 1});
    $('#RETRACT_DIST').css({opacity: 1});
    $('#RETRACT_DIST').prop('disabled', false);
  } else {
    $('label[for=SPEED_RETRACT]').parent().css({opacity: 0.5});
    $('#SPEED_RETRACT').css({opacity: 0.5});
    $('#SPEED_RETRACT').prop('disabled', true);
    $('label[for=SPEED_UNRETRACT]').parent().css({opacity: 0.5});
    $('#SPEED_UNRETRACT').css({opacity: 0.5});
    $('#SPEED_UNRETRACT').prop('disabled', true);
    $('label[for=RETRACT_DIST]').parent().css({opacity: 0.5});
    $('#RETRACT_DIST').css({opacity: 0.5});
    $('#RETRACT_DIST').prop('disabled', true);
  }
}

function toggleLeadingZero() {
  if ($('#USE_LINENO').is(':checked')) {
    $('label[for=LINENO_NO_LEADING_ZERO]').parent().show();
    $('#LINENO_NO_LEADING_ZERO').parent().show();
  } else {
    $('label[for=LINENO_NO_LEADING_ZERO]').parent().hide();
    $('#LINENO_NO_LEADING_ZERO').parent().hide();
  }
}

function previewStartGcode(){
  let preview = (
    "<tt>" +
    config.startGCode(true) +
    `
G21 ; Millimeter units
G90 ; Absolute XYZ
M83 ; Relative E
G92 E0 ; Reset extruder distance</tt>`
  ).replace(/\n/g, "<br>");

  $("[start-gcode-preview]").html(preview)
};

// show the calculated values at the bottom of the form
function displayCalculatedValues(action = 'show'){
  let body='';

  if (action == 'show'){
    body += `\
<strong>Print size X: </strong> ${Math.round10(config.fitWidth(), -1)}mm<br>
<strong>Print size Y: </strong> ${Math.round10(config.fitHeight(), -1)}mm<br>
<strong>Pattern count: </strong> ${config.numPatterns()}<br>
<strong>${(config.firmware === 'klipper' || config.firmware === 'rrf3') ? 'PA' : 'LA'} values: </strong>`
    for (let i = 0; i < config.numPatterns(); i++){
      body += `${Math.round10((config.pa_start + i * config.pa_step),PA_round)}`;
      if (i != config.numPatterns() - 1){ // add comma separator if not last item in list
        body += ', ';
      }
      else {
         body += '<br><br>';
      }
    }

    $('#information').html(body);
    $('#information').parent().show();
  } else {
    body = '';
    $('#information').html('');
    $('#information').parent().hide();
  }
}

// https://github.com/aligator/gcode-viewer
function render(gcode) {
    //const TRANSPARENT_COLOR = new gcodeViewer.Color()
    const DEFAULT_COLOR = new gcodeViewer.Color('#0000ff')
    const PERIM_COLOR = new gcodeViewer.Color('#00ff00')
    const FILL_COLOR = new gcodeViewer.Color('#80ff00')

    let colorConfig = []

    gcode.split("\n").forEach(function(line, i) {
        let color
        if (line.includes("; Draw perimeter")) {
          color = PERIM_COLOR
        } else if (line.includes("; Fill")) {
          color = FILL_COLOR
        } else {
          color = DEFAULT_COLOR
        }
        if (colorConfig.length === 0 || color && colorConfig[colorConfig.length-1].color !== color) {
            colorConfig.push({toLine: i, color})
        } else {
            colorConfig[colorConfig.length - 1].toLine = i
        }
    });

    const renderer = new gcodeViewer.GCodeRenderer(gcode, 480, 360, new gcodeViewer.Color(0x808080))
    //const renderer = new gcodeViewer.GCodeRenderer(gcode, 1024, 768, new gcodeViewer.Color(0x808080))
    renderer.colorizer = new gcodeViewer.LineColorizer(colorConfig)
    renderer.travelWidth = 0 // disable rendering travel moves
    $('#gcode-viewer').empty().append(renderer.element())
    renderer.render()
    renderer.fitCamera()
}

// sanity checks for pattern / bed size
function validate(updateRender = false) {
  let decimals = getDecimals(parseFloat(config.pa_step));
  let invalid = 0;
  let validationFail = false;

  // Reset all warnings before re-check
  $("[data-settings]").each((i, t) => {
    //t.setCustomValidity('');
    const tid = $(t).attr("id");
    $(`label[for=${tid}]`).removeClass("invalid");
  });
  $("#warning1").hide();
  $("#warning2").hide();
  $("#warning3").hide();
  $("#warning4").hide();
  $("#startGcodeWarning").hide();
  $("#downloadButton").prop("disabled", false);
  $("#saveSettingsButton").prop("disabled", false);

  // Check for proper numerical values
  for (const property in Settings) {
    if (typeof Settings[property] === "number") {
      const value = config[property];
      if (
        (isNaN(value) && !isFinite(value)) ||
        value.toString().trim().length === 0 ||
        value < 0
      ) {
        let inputField = $(property.toUpperCase());
        if (!inputField.is(":disabled")) {
          $("label[for=" + property.toUpperCase() + "]").addClass("invalid");
          $("#warning1").text(
            "Some values are not proper numbers. Check highlighted Settings."
          );
          $("#warning1").addClass("invalid");
          $("#warning1").show();
          validationFail = true;
        }
      }
    }
  }

  // Check text inputs
  if (config.filename == "" || config.filename == null) {
    $("label[for=FILENAME]").addClass("invalid");
    $("#warning2").text("File name cannot be blank.");
    $("#warning2").addClass("invalid");
    $("#warning2").show();
    validationFail = true;
  }

  // Make sure spacing is >= 1mm
  if (config.pattern_spacing < 1 || config.pattern_spacing == null) {
    $("label[for=PATTERN_SPACING]").addClass("invalid");
    $("#warning3").text("Pattern spacing must be at least 1mm");
    $("#warning3").addClass("invalid");
    $("#warning3").show();
    validationFail = true;
  }

  // Make sure spacing is <= 180 degrees
  if (config.corner_angle > 180 || config.corner_angle == null) {
    $("label[for=CORNER_ANGLE]").addClass("invalid");
    $("#warning3").text("Pattern angle must be <= 180 degrees");
    $("#warning3").addClass("invalid");
    $("#warning3").show();
    validationFail = true;
  }

  if (!validationFail) {
    // only check if above checks pass
    // Check if pressure advance stepping is a multiple of the pressure advance Range
    if (
      (Math.round10(config.pa_end - config.pa_start, config.pa_round) *
        Math.pow(10, decimals)) %
        (config.pa_step * Math.pow(10, decimals)) !==
      0
    ) {
      $("label[for=PA_START]").addClass("invalid");
      $("label[for=PA_END]").addClass("invalid");
      $("label[for=PA_STEP]").addClass("invalid");
      $("#warning1").text(
        "Your PA range cannot be cleanly divided. Check highlighted sttings."
      );
      $("#warning1").addClass("invalid");
      $("#warning1").show();
      invalid = 1;
      validationFail = true;
    }
  }

    if (!validationFail) {
      // only check if above checks pass
      // Check if PA smooth exceeds 0.2
      if (config.firmware == 'klipper' && config.pa_smooth && config.pa_end > 0.2){
          $("label[for=PA_END]").addClass("invalid");
          $("#warning1").text(
            "PA smooth cannot exceed 0.2."
          );
          $("#warning1").addClass("invalid");
          $("#warning1").show();
          invalid = 1;
          validationFail = true;
      }
    }

  if (!validationFail) {
    // only check if above checks pass
    if (config.pa_end - config.pa_start < 0) {
      // Check if pressure advance stepping is a multiple of the pressure advance Range
      $("label[for=PA_START]").addClass("invalid");
      $("label[for=PA_END]").addClass("invalid");
      $("#warning1").text(
        "Your PA start value cannot be higher than your PA end value. Check highlighted settings."
      );
      $("#warning1").addClass("invalid");
      $("#warning1").show();
      invalid = 1;
      validationFail = true;
    }
  }

  if (!validationFail) {
    // only check if above checks pass
    // Check if pattern settings exceed bed size
    // too tall for round bed
    if (
      config.bed_shape === "Round" &&
      Math.sqrt(
        Math.pow(config.fitWidth(), 2) + Math.pow(config.fitHeight(), 2)
      ) >
        Math.trunc(config.bed_x) - 5 &&
      config.fitHeight() > config.fitWidth()
    ) {
      $("label[for=PA_START]").addClass("invalid");
      $("label[for=PA_END]").addClass("invalid");
      $("label[for=PA_STEP]").addClass("invalid");
      $("label[for=PATTERN_SPACING]").addClass("invalid");
      $("label[for=CORNER_ANGLE]").addClass("invalid");
      $("label[for=WALL_SIDE_LENGTH]").addClass("invalid");
      $("label[for=WALL_COUNT]").addClass("invalid");
      $("label[for=BED_X]").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").text(
        "Your Pattern size (x: " +
          Math.round(config.fitWidth()) +
          ", y: " +
          Math.round(config.fitHeight()) +
          ") exceeds your bed's diameter. Check highlighted settings."
      );
      $(invalid ? "#warning2" : "#warning1").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").show();
      validationFail = true;
    }

    // too wide for round bed
    if (
      config.bed_shape === "Round" &&
      Math.sqrt(
        Math.pow(config.fitWidth(), 2) + Math.pow(config.fitHeight(), 2)
      ) >
        Math.trunc(config.bed_x) - 5 &&
      config.fitWidth() > config.fitHeight()
    ) {
      $("label[for=PA_START]").addClass("invalid");
      $("label[for=PA_END]").addClass("invalid");
      $("label[for=PA_STEP]").addClass("invalid");
      $("label[for=PATTERN_SPACING]").addClass("invalid");
      $("label[for=CORNER_ANGLE]").addClass("invalid");
      $("label[for=WALL_SIDE_LENGTH]").addClass("invalid");
      $("label[for=WALL_COUNT]").addClass("invalid");
      $("label[for=BED_X]").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").text(
        "Your Pattern size (x: " +
          Math.round(config.fitWidth()) +
          ", y: " +
          Math.round(config.fitHeight()) +
          ") exceeds your bed's diameter. Check highlighted settings."
      );
      $(invalid ? "#warning2" : "#warning1").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").show();
      validationFail = true;
    }

    // too wide
    if (
      config.bed_shape === "Rect" &&
      config.fitWidth() > Math.trunc(config.bed_x) - 5
    ) {
      $("label[for=PA_START]").addClass("invalid");
      $("label[for=PA_END]").addClass("invalid");
      $("label[for=PA_STEP]").addClass("invalid");
      $("label[for=PATTERN_SPACING]").addClass("invalid");
      $("label[for=CORNER_ANGLE]").addClass("invalid");
      $("label[for=WALL_SIDE_LENGTH]").addClass("invalid");
      $("label[for=WALL_COUNT]").addClass("invalid");
      $("label[for=BED_X]").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").text(
        "Your Pattern size (x: " +
          Math.round(config.fitWidth()) +
          ", y: " +
          Math.round(config.fitHeight()) +
          ") exceeds your X bed size. Check highlighted settings."
      );
      $(invalid ? "#warning2" : "#warning1").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").show();
      validationFail = true;
    }

    // too tall
    if (
      config.bed_shape === "Rect" &&
      config.fitHeight() > Math.trunc(config.bed_y) - 5
    ) {
      $("label[for=PA_START]").addClass("invalid");
      $("label[for=PA_END]").addClass("invalid");
      $("label[for=PA_STEP]").addClass("invalid");
      $("label[for=PATTERN_SPACING]").addClass("invalid");
      $("label[for=CORNER_ANGLE]").addClass("invalid");
      $("label[for=WALL_SIDE_LENGTH]").addClass("invalid");
      $("label[for=WALL_COUNT]").addClass("invalid");
      $("label[for=BED_Y]").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").text(
        "Your Pattern size (x: " +
          Math.round(config.fitWidth()) +
          ", y: " +
          Math.round(config.fitHeight()) +
          ") exceeds your Y bed size. Check highlighted settings."
      );
      $(invalid ? "#warning2" : "#warning1").addClass("invalid");
      $(invalid ? "#warning2" : "#warning1").show();
      validationFail = true;
    }
  }

  /*
  // check start g-code for missing essential g-codes
  let message = '<ul>';
  $('#startGcodeWarning').hide();
  $('#startGcodeWarning').removeClass('invalid');
  $('#startGcodeWarning').html('');

  switch (true){
    case $('#START_GCODE_TYPE').val().includes('custom') : // custom and custom
      if ($('#START_GCODE').val().match(/G28(?! Z)/gm) == null){ message += "<li><tt>G28</tt></li>" } // ensure custom gcodes always include G28 / G28 X* / G28 Y* (not just G28 Z on its own)
      // don't break - continue on to other cases
    case $('#START_GCODE_TYPE').val() !== 'standalone_temp_passing' : // custom, custom, and standalone
      if (!$('#START_GCODE').val().includes('M190 S[BED_TEMP]')){ message += "<li><tt>M190 S[BED_TEMP]</tt>" } // check for M109 / M190 heating gcodes using variables
      if (!$('#START_GCODE').val().includes('M109 S[HOTEND_TEMP]') && !$('#START_GCODE').val().includes('M568 S[HOTEND_TEMP]')){ message += "<li><tt>M109 S[HOTEND_TEMP]</tt></li>" }
      break;
    case $('#START_GCODE_TYPE').val() === 'standalone_temp_passing' : // standalone_temp_passing
      if (!$('#START_GCODE').val().includes('[BED_TEMP]')){ message += "<li><tt>[BED_TEMP]</tt></li>" } // only check for presence of variables, not heating gcodes
      if (!$('#START_GCODE').val().includes('[HOTEND_TEMP]')){ message += "<li><tt>[HOTEND_TEMP]</tt></li>" }
      break;
  }

  if (message !== '<ul>'){
    message = `\
Please check your start g-code. It does not contain:<br>
${message}<br>`
    if ($('#START_GCODE_TYPE').val() == 'standalone_temp_passing'){
      message += `\
</ul>
<i>It is required to use variables for bed & hotend temps rather than real values.</i><br>
Supported variables (listed above) will change to real values upon g-code generation.<br>
You may use real values for anything apart from bed / hotend temps.`
    }
    else {
      message += `\
</ul>
Copy / paste these lines into your start g-code <i>exactly as listed</i>, using variables instead of real values.<br>
Supported variables (listed above) will change to real values upon g-code generation.<br>
You may use real values for anything apart from bed / hotend temps.`
    }
    $('#startGcodeWarning').html(message);
    $('#startGcodeWarning').addClass('invalid');
    $('#startGcodeWarning').show();
    $('label[for=START_GCODE]').addClass('invalid');
    $('#warning4').text('Problems were found in your start g-code. Check highlighted setting.');
    $('#warning4').addClass('invalid');
    $('#warning4').show();
    validationFail = true;
  }
  */

  if (!validationFail) {
    // actions to take if all checks pass
    displayCalculatedValues();
    if (updateRender) {
      genGcode();
      render(state.pa_script);
    }
  } else {
    // actions to take on ANY failure
    $("#downloadButton").prop("disabled", true);
    $("#saveSettingsButton").prop("disabled", true);
    displayCalculatedValues("hide");
  }
}

$(window).load(() => {
  // create tab index dynamically
  $(':input:not(:hidden)').each(function(i) {
    $(this).attr('tabindex', i + 1);
  });
  config.attachForm()

  // run all toggles after loading user settings
  toggleBedShape();
  toggleFirmwareOptions();
  toggleZHop();
  togglePatternOptions();
  toggleAnchorOptions();
  toggleLeadingZero();
  toggleAcceleration();
  toggleExtruderName()
  toggleFwRetract()
  toggleExpertMode();
  toggleSEGcode();

  // validate input on page load
  // generates gcode and updates 3d preview if validations pass
  validate(true);

  // Focus the first field
  //$('#padv input:first').focus();
});

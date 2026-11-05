/* Thin JSON ABI around Primer3 2.6.1 thal().  GPL-2.0-or-later. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <emscripten/emscripten.h>
#include "thal.h"
#include "thal_parameters.h"

static int initialized = 0;

static char *json_string(const char *value) {
  if (!value) value = "";
  const size_t length = strlen(value);
  if (length > (SIZE_MAX - 3) / 6) return NULL;
  const size_t cap = length * 6 + 3;
  char *out = (char *)malloc(cap);
  if (!out) return NULL;
  size_t used = 0;
  out[used++] = '"';
  while (*value) {
    unsigned char c = (unsigned char)*value++;
    if (c == '"' || c == '\\') { out[used++] = '\\'; out[used++] = (char)c; }
    else if (c == '\n') { out[used++] = '\\'; out[used++] = 'n'; }
    else if (c == '\r') { out[used++] = '\\'; out[used++] = 'r'; }
    else if (c == '\t') { out[used++] = '\\'; out[used++] = 't'; }
    else if (c < 0x20) {
      static const char hex[] = "0123456789abcdef";
      out[used++] = '\\'; out[used++] = 'u'; out[used++] = '0'; out[used++] = '0';
      out[used++] = hex[c >> 4]; out[used++] = hex[c & 0x0f];
    }
    else out[used++] = (char)c;
  }
  out[used++] = '"'; out[used] = '\0';
  return out;
}

static char *json_error(const char *message) {
  char *escaped = json_string(message);
  if (!escaped) return NULL;
  const size_t needed = strlen(escaped) + sizeof("{\"error\":}");
  char *json = (char *)malloc(needed);
  if (!json) { free(escaped); return NULL; }
  snprintf(json, needed, "{\"error\":%s}", escaped);
  free(escaped);
  return json;
}

EMSCRIPTEN_KEEPALIVE
char *primer3_thal_align(const char *seq1, const char *seq2, int mode,
                         double mv_mM, double dv_mM, double dntp_mM,
                         double dna_nM, double structure_temp_c, int max_loop) {
  thal_args args;
  thal_results result;
  thal_parameters params;
  if (!seq1 || !seq2 || mode < 1 || mode > 3 || max_loop < 0 || max_loop > 30) {
    return json_error("invalid input: mode 1..3, maxLoop 0..30 required");
  }
  if (!isfinite(mv_mM) || !isfinite(dv_mM) || !isfinite(dntp_mM) ||
      !isfinite(dna_nM) || !isfinite(structure_temp_c) ||
      mv_mM < 0 || dv_mM < 0 || dntp_mM < 0 || dna_nM <= 0) {
    return json_error("chemistry and temperature values must be finite; concentrations must be nonnegative and DNA concentration positive");
  }
  if (!initialized) {
    thal_set_null_parameters(&params);
    int parameter_status = set_default_thal_parameters(&params);
    int thermodynamic_status = parameter_status == 0
      ? get_thermodynamic_values(&params, &result) : -1;
    thal_free_parameters(&params);
    if (thermodynamic_status != 0) {
      return json_error("failed to initialize Primer3 thermodynamic parameters");
    }
    initialized = 1;
  }
  set_thal_default_args(&args);
  args.type = (thal_alignment_type)mode;
  args.mv = mv_mM; args.dv = dv_mM; args.dntp = dntp_mM; args.dna_conc = dna_nM;
  args.temp = structure_temp_c; args.maxLoop = max_loop;
  memset(&result, 0, sizeof(result));
  result.sec_struct = NULL;
  thal((const unsigned char *)seq1, (const unsigned char *)seq2, &args, THL_STRUCT, &result);
  if (result.temp == THAL_ERROR_SCORE || !isfinite(result.temp)) {
    char *json = json_error(result.msg[0] ? result.msg : "non-finite thermodynamic result");
    free(result.sec_struct);
    return json;
  } else {
    char *structure = json_string(result.sec_struct);
    if (!structure) {
      free(result.sec_struct);
      return NULL;
    }
    const char *mode_name = mode == 1 ? "any" : mode == 2 ? "end1" : "end2";
    const int required = snprintf(NULL, 0,
      "{\"tmC\":%.8g,\"alignEnd1\":%d,\"alignEnd2\":%d,\"structure\":%s,\"mode\":\"%s\"}",
      result.temp, result.align_end_1, result.align_end_2, structure, mode_name);
    if (required < 0) {
      free(structure);
      free(result.sec_struct);
      return NULL;
    }
    char *json = (char *)malloc((size_t)required + 1);
    if (!json) {
      free(structure);
      free(result.sec_struct);
      return NULL;
    }
    snprintf(json, (size_t)required + 1,
      "{\"tmC\":%.8g,\"alignEnd1\":%d,\"alignEnd2\":%d,\"structure\":%s,\"mode\":\"%s\"}",
      result.temp, result.align_end_1, result.align_end_2, structure, mode_name);
    free(structure);
    free(result.sec_struct);
    return json;
  }
  /* thal owns/frees per-alignment matrices. Keep default loop tables alive
     until module teardown so subsequent calls remain initialized. */
}

EMSCRIPTEN_KEEPALIVE
void primer3_thal_free(char *ptr) { free(ptr); }

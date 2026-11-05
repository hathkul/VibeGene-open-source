export type Primer3SettingKind = 'int' | 'float' | 'bool' | 'choice' | 'text' | 'sequence' | 'sizeRangeList' | 'coordinates'

export type Primer3SettingGroup = 'sequence' | 'general' | 'advanced' | 'internal' | 'penalties' | 'quality'

export type Primer3SettingDef = {
  tag: string
  label: string
  group: Primer3SettingGroup
  section: string
  row?: string
  kind: Primer3SettingKind
  /** primer3_core 2.6.1 default; '' means the tag is omitted and Primer3 treats it as unset. */
  defaultValue: string
  choices?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
  help: string
  unsupported?: string
  /**
   * Tags Primer3 rejects in the same run as this one when both carry non-default values.
   * Listed on both sides of each conflict.
   */
  conflictsWith?: string[]
}

const BP = 'bp'
const CELSIUS = '°C'
const PERCENT = '%'
const MILLIMOLAR = 'mM'
const NO_KMER_LISTS = 'Requires k-mer lists that are not bundled'
const MAX_OLIGO_LENGTH = 36

export const PRIMER3_SETTINGS: Primer3SettingDef[] = [
  // general
  { tag: 'PRIMER_TASK', label: 'Task', group: 'general', section: 'Task & output', kind: 'choice', defaultValue: 'generic', choices: [
    { value: 'generic', label: 'Generic' },
    { value: 'pick_detection_primers', label: 'Detection primers (= generic)' },
    { value: 'check_primers', label: 'Check primers' },
    { value: 'pick_primer_list', label: 'Primer list' },
    { value: 'pick_sequencing_primers', label: 'Sequencing primers' },
    { value: 'pick_cloning_primers', label: 'Cloning primers' },
    { value: 'pick_discriminative_primers', label: 'Discriminative primers' },
    { value: 'pick_pcr_primers', label: 'PCR primers (legacy)' },
    { value: 'pick_pcr_primers_and_hyb_probe', label: 'PCR primers + probe (legacy)' },
    { value: 'pick_left_only', label: 'Left primer only (legacy)' },
    { value: 'pick_right_only', label: 'Right primer only (legacy)' },
    { value: 'pick_hyb_probe_only', label: 'Probe only (legacy)' },
  ], help: 'What Primer3 designs. Generic picks whichever of left primer, right primer and internal oligo are enabled; the legacy pick_* tasks set those pick options themselves.' },
  { tag: 'PRIMER_PICK_LEFT_PRIMER', label: 'Pick left primer', group: 'general', section: 'Task & output', kind: 'bool', defaultValue: '1', help: 'Design left (forward) primers.' },
  { tag: 'PRIMER_PICK_INTERNAL_OLIGO', label: 'Pick internal oligo', group: 'general', section: 'Task & output', kind: 'bool', defaultValue: '0', help: 'Design an internal oligo (hybridization probe that detects the PCR product).' },
  { tag: 'PRIMER_PICK_RIGHT_PRIMER', label: 'Pick right primer', group: 'general', section: 'Task & output', kind: 'bool', defaultValue: '1', help: 'Design right (reverse) primers.' },
  { tag: 'PRIMER_NUM_RETURN', label: 'Number to return', group: 'general', section: 'Task & output', kind: 'int', defaultValue: '5', min: 1, step: 1, help: 'Maximum number of primer pairs (or oligos) to return, best first. Large values increase running time.' },

  { tag: 'PRIMER_PRODUCT_SIZE_RANGE', label: 'Product size ranges', group: 'general', section: 'Product size', kind: 'sizeRangeList', defaultValue: '100-300', help: 'Allowed amplicon lengths as space-separated min-max ranges, e.g. "100-150 200-250"; ranges listed first are preferred. Overhangs do not count toward the product size.' },
  { tag: 'PRIMER_PRODUCT_OPT_SIZE', label: 'Opt product size', group: 'general', section: 'Product size', kind: 'int', defaultValue: '', min: 0, step: 1, unit: BP, help: 'Optimum amplicon length; empty or 0 means no optimum. Only affects ranking when the product size weights are non-zero, and slows the search.' },

  { tag: 'PRIMER_PRODUCT_MIN_TM', label: 'Min', group: 'general', section: 'Product Tm', row: 'PRIMER_PRODUCT_TM', kind: 'float', defaultValue: '-1000000', step: 0.1, unit: CELSIUS, help: 'Lowest allowed amplicon melting temperature (Bolton & McCarthy formula); the default -1000000 means no limit.' },
  { tag: 'PRIMER_PRODUCT_OPT_TM', label: 'Opt', group: 'general', section: 'Product Tm', row: 'PRIMER_PRODUCT_TM', kind: 'float', defaultValue: '', step: 0.1, unit: CELSIUS, help: 'Optimum amplicon melting temperature; empty means no optimum. Only used when the product Tm weights are non-zero.' },
  { tag: 'PRIMER_PRODUCT_MAX_TM', label: 'Max', group: 'general', section: 'Product Tm', row: 'PRIMER_PRODUCT_TM', kind: 'float', defaultValue: '1000000', step: 0.1, unit: CELSIUS, help: 'Highest allowed amplicon melting temperature (Bolton & McCarthy formula); the default 1000000 means no limit.' },

  { tag: 'PRIMER_MIN_SIZE', label: 'Min', group: 'general', section: 'Primer size', row: 'PRIMER_SIZE', kind: 'int', defaultValue: '18', min: 1, max: MAX_OLIGO_LENGTH, step: 1, unit: BP, help: 'Shortest acceptable primer length; must be at least 1 and no more than the maximum.' },
  { tag: 'PRIMER_OPT_SIZE', label: 'Opt', group: 'general', section: 'Primer size', row: 'PRIMER_SIZE', kind: 'int', defaultValue: '20', min: 1, max: MAX_OLIGO_LENGTH, step: 1, unit: BP, help: 'Preferred primer length; Primer3 favours primers close to it.' },
  { tag: 'PRIMER_MAX_SIZE', label: 'Max', group: 'general', section: 'Primer size', row: 'PRIMER_SIZE', kind: 'int', defaultValue: '27', min: 1, max: MAX_OLIGO_LENGTH, step: 1, unit: BP, help: 'Longest acceptable primer length; Primer3 cannot evaluate oligos longer than 36 bases.' },

  { tag: 'PRIMER_PAIR_MAX_DIFF_TM', label: 'Max Tm difference', group: 'general', section: 'Primer Tm', kind: 'float', defaultValue: '100', min: 0, step: 0.1, unit: CELSIUS, help: 'Maximum difference between the melting temperatures of the left and right primer.' },
  { tag: 'PRIMER_MIN_TM', label: 'Min', group: 'general', section: 'Primer Tm', row: 'PRIMER_TM', kind: 'float', defaultValue: '57', step: 0.1, unit: CELSIUS, help: 'Lowest acceptable primer melting temperature.' },
  { tag: 'PRIMER_OPT_TM', label: 'Opt', group: 'general', section: 'Primer Tm', row: 'PRIMER_TM', kind: 'float', defaultValue: '60', step: 0.1, unit: CELSIUS, help: 'Preferred primer melting temperature, calculated with the selected Tm formula and salt correction.' },
  { tag: 'PRIMER_MAX_TM', label: 'Max', group: 'general', section: 'Primer Tm', row: 'PRIMER_TM', kind: 'float', defaultValue: '63', step: 0.1, unit: CELSIUS, help: 'Highest acceptable primer melting temperature.' },

  { tag: 'PRIMER_MIN_GC', label: 'Min', group: 'general', section: 'Primer GC %', row: 'PRIMER_GC', kind: 'float', defaultValue: '20', min: 0, max: 100, step: 0.1, unit: PERCENT, help: 'Lowest acceptable percentage of G and C bases in a primer.' },
  { tag: 'PRIMER_OPT_GC_PERCENT', label: 'Opt', group: 'general', section: 'Primer GC %', row: 'PRIMER_GC', kind: 'float', defaultValue: '', min: 0, max: 100, step: 0.1, unit: PERCENT, help: 'Preferred GC percentage; empty means no optimum. Only used when the GC % weights are non-zero.' },
  { tag: 'PRIMER_MAX_GC', label: 'Max', group: 'general', section: 'Primer GC %', row: 'PRIMER_GC', kind: 'float', defaultValue: '80', min: 0, max: 100, step: 0.1, unit: PERCENT, help: 'Highest acceptable percentage of G and C bases in a primer.' },

  { tag: 'PRIMER_GC_CLAMP', label: 'GC clamp', group: 'general', section: 'Primer composition', kind: 'int', defaultValue: '0', min: 0, max: MAX_OLIGO_LENGTH, step: 1, help: 'Number of consecutive G or C bases required at the 3′ end of left and right primers (not internal oligos); must not exceed the min primer size.' },
  { tag: 'PRIMER_MAX_END_GC', label: 'Max 3′ end G/C', group: 'general', section: 'Primer composition', kind: 'int', defaultValue: '5', min: 0, max: 5, step: 1, help: 'Maximum number of G or C bases among the last five 3′ bases of a left or right primer.' },
  { tag: 'PRIMER_MAX_POLY_X', label: 'Max poly-X', group: 'general', section: 'Primer composition', kind: 'int', defaultValue: '5', min: 0, step: 1, unit: BP, help: 'Longest allowed mononucleotide run such as AAAAAA; Ns count as the worst case, so GGGNNN is a run of 6.' },
  { tag: 'PRIMER_MAX_NS_ACCEPTED', label: 'Max Ns accepted', group: 'general', section: 'Primer composition', kind: 'int', defaultValue: '0', min: 0, step: 1, help: 'Maximum number of unknown bases (N) allowed in a primer.' },
  { tag: 'PRIMER_MAX_END_STABILITY', label: 'Max 3′ stability', group: 'general', section: 'Primer composition', kind: 'float', defaultValue: '100', min: 0, step: 0.1, unit: 'kcal/mol', help: 'Maximum ΔG for disrupting the duplex formed by the last five 3′ bases of a left or right primer; higher values allow more stable 3′ ends.' },

  { tag: 'PRIMER_MAX_SELF_ANY_TH', label: 'Max self compl. Tm', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Maximum melting temperature of the most stable structure a primer forms with a copy of itself (thermodynamic oligo alignment).' },
  { tag: 'PRIMER_MAX_SELF_END_TH', label: 'Max 3′ self compl. Tm', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Like Max self compl. Tm, but only for structures that anchor the 3′ end and could prime a primer-dimer.' },
  { tag: 'PRIMER_MAX_HAIRPIN_TH', label: 'Max hairpin Tm', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Maximum melting temperature of the most stable hairpin a primer forms (thermodynamic oligo alignment).' },
  { tag: 'PRIMER_PAIR_MAX_COMPL_ANY_TH', label: 'Max pair compl. Tm', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Maximum melting temperature of the most stable structure formed between the left and right primer (thermodynamic oligo alignment).' },
  { tag: 'PRIMER_PAIR_MAX_COMPL_END_TH', label: 'Max 3′ pair compl. Tm', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Like Max pair compl. Tm, but only for structures that anchor the 3′ end of one primer on the other.' },
  { tag: 'PRIMER_MAX_SELF_ANY', label: 'Max self complementarity', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '8', min: 0, max: 9999.99, step: 0.1, help: 'Maximum local alignment score of a primer against itself (+1 per complementary base, -1 mismatch, -2 gap). Used when thermodynamic oligo alignment is off.' },
  { tag: 'PRIMER_MAX_SELF_END', label: 'Max 3′ self compl.', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '3', min: 0, max: 9999.99, step: 0.1, help: 'Maximum 3′-anchored alignment score of a primer against itself, predicting primer-dimers. Used when thermodynamic oligo alignment is off.' },
  { tag: 'PRIMER_PAIR_MAX_COMPL_ANY', label: 'Max pair complementarity', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '8', min: 0, max: 9999.99, step: 0.1, help: 'Maximum local alignment score between the left and right primer. Used when thermodynamic oligo alignment is off.' },
  { tag: 'PRIMER_PAIR_MAX_COMPL_END', label: 'Max 3′ pair compl.', group: 'general', section: 'Complementarity', kind: 'float', defaultValue: '3', min: 0, max: 9999.99, step: 0.1, help: 'Maximum 3′-anchored alignment score of the left primer against the right primer. Used when thermodynamic oligo alignment is off.' },

  { tag: 'PRIMER_MAX_LIBRARY_MISPRIMING', label: 'Max library mispriming', group: 'general', section: 'Mispriming', kind: 'float', defaultValue: '12', min: 0, max: 9999.99, step: 0.1, help: 'Maximum weighted alignment score of a primer against any sequence in the mispriming library.' },
  { tag: 'PRIMER_PAIR_MAX_LIBRARY_MISPRIMING', label: 'Pair library mispriming', group: 'general', section: 'Mispriming', kind: 'float', defaultValue: '24', min: 0, max: 9999.99, step: 0.1, help: 'Maximum sum of the left and right primer scores against any single mispriming library sequence (library weights are ignored).' },
  { tag: 'PRIMER_LIB_AMBIGUITY_CODES_CONSENSUS', label: 'Ambiguity as consensus', group: 'general', section: 'Mispriming', kind: 'bool', defaultValue: '0', help: 'Treat IUPAC ambiguity codes in library sequences as consensus, so N matches any base. Leave off if the library contains runs of N.' },
  { tag: 'PRIMER_MAX_TEMPLATE_MISPRIMING', label: 'Max template mispriming', group: 'general', section: 'Mispriming', kind: 'float', defaultValue: '', max: 9999.99, step: 0.1, help: 'Maximum alignment score of a primer at other sites in the template; empty or negative skips the check. Used when thermodynamic template alignment is off.' },
  { tag: 'PRIMER_MAX_TEMPLATE_MISPRIMING_TH', label: 'Max template mispr. Tm', group: 'general', section: 'Mispriming', kind: 'float', defaultValue: '', max: 9999.99, step: 0.1, unit: CELSIUS, help: 'Maximum melting temperature of a primer at other sites in the template (thermodynamic template alignment); empty or negative skips the check. 47 suits a 57 °C min Tm.' },
  { tag: 'PRIMER_PAIR_MAX_TEMPLATE_MISPRIMING', label: 'Pair template mispriming', group: 'general', section: 'Mispriming', kind: 'float', defaultValue: '', max: 9999.99, step: 0.1, help: 'Maximum summed template mispriming score of both primers; empty or negative skips the check. Used when thermodynamic template alignment is off.' },
  { tag: 'PRIMER_PAIR_MAX_TEMPLATE_MISPRIMING_TH', label: 'Pair template mispr. Tm', group: 'general', section: 'Mispriming', kind: 'float', defaultValue: '', max: 9999.99, step: 0.1, unit: CELSIUS, help: 'Maximum summed melting temperature of both primers at other template sites oriented to allow amplification; empty or negative skips the check.' },

  { tag: 'PRIMER_SALT_MONOVALENT', label: 'Monovalent cations', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '50', min: 0, step: 0.1, unit: MILLIMOLAR, help: 'Concentration of monovalent cations (usually K⁺) used for melting temperature calculations.' },
  { tag: 'PRIMER_SALT_DIVALENT', label: 'Divalent cations', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '1.5', min: 0, step: 0.1, unit: MILLIMOLAR, help: 'Concentration of divalent cations (usually Mg²⁺); Primer3 converts it, together with dNTPs, to a monovalent equivalent (von Ahsen 2001).' },
  { tag: 'PRIMER_DNTP_CONC', label: 'dNTP conc', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '0.6', min: 0, step: 0.1, unit: MILLIMOLAR, help: 'Total concentration of all four dNTPs (0.2 mM each gives 0.8). Only affects Tm when divalent cations are above 0.' },
  { tag: 'PRIMER_DNA_CONC', label: 'Oligo conc', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '50', min: 0, step: 1, unit: 'nM', help: 'Concentration of each annealing oligo, used to estimate melting temperatures (SantaLucia 1998).' },
  { tag: 'PRIMER_DMSO_CONC', label: 'DMSO conc', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unit: PERCENT, help: 'DMSO concentration; Tm is lowered by DMSO factor × DMSO %.' },
  { tag: 'PRIMER_DMSO_FACTOR', label: 'DMSO factor', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '0.6', min: 0, step: 0.05, help: 'Tm correction per percent DMSO; 0.6 follows Musielski 1981, published alternatives range from 0.5 to 0.75.' },
  { tag: 'PRIMER_FORMAMIDE_CONC', label: 'Formamide conc', group: 'general', section: 'Concentrations', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unit: 'mol/l', help: 'Formamide concentration; Tm is corrected by (0.453 × GC fraction - 2.88) × concentration (Blake & Delcourt 1996).' },

  // advanced
  { tag: 'PRIMER_TM_FORMULA', label: 'Tm formula', group: 'advanced', section: 'Tm calculation', kind: 'choice', defaultValue: '1', choices: [
    { value: '0', label: 'Breslauer 1986' },
    { value: '1', label: 'SantaLucia 1998' },
  ], help: 'Nearest-neighbour parameters for oligo Tm: Breslauer et al. 1986 (legacy Primer3 behaviour) or SantaLucia 1998 (recommended).' },
  { tag: 'PRIMER_SALT_CORRECTIONS', label: 'Salt correction', group: 'advanced', section: 'Tm calculation', kind: 'choice', defaultValue: '1', choices: [
    { value: '0', label: 'Schildkraut & Lifson 1965' },
    { value: '1', label: 'SantaLucia 1998' },
    { value: '2', label: 'Owczarzy 2004/2008' },
  ], help: 'Salt correction for oligo Tm: Schildkraut & Lifson 1965 (legacy), SantaLucia 1998 (recommended) or Owczarzy 2004 (monovalent) / 2008 (Mg²⁺).' },

  { tag: 'PRIMER_THERMODYNAMIC_OLIGO_ALIGNMENT', label: 'Thermo oligo alignment', group: 'advanced', section: 'Thermodynamic alignment', kind: 'bool', defaultValue: '1', help: 'Use thermodynamic models (the Tm limits) rather than alignment scores to judge hairpins and primer dimers.' },
  { tag: 'PRIMER_THERMODYNAMIC_TEMPLATE_ALIGNMENT', label: 'Thermo template align.', group: 'advanced', section: 'Thermodynamic alignment', kind: 'bool', defaultValue: '0', help: 'Use thermodynamic models rather than alignment scores to judge binding to other template sites (template mispriming Tm limits). Slower.' },

  { tag: 'PRIMER_ANNEALING_TEMP', label: 'Annealing temp', group: 'advanced', section: 'Primer fraction bound', kind: 'float', defaultValue: '-10', step: 0.1, unit: CELSIUS, help: 'PCR annealing temperature at which Primer3 reports the percentage of each oligo bound; the default -10 turns this off.' },
  { tag: 'PRIMER_MIN_BOUND', label: 'Min', group: 'advanced', section: 'Primer fraction bound', row: 'PRIMER_BOUND', kind: 'float', defaultValue: '-10', step: 0.1, unit: PERCENT, help: 'Lowest acceptable percentage of primer bound at the annealing temperature.' },
  { tag: 'PRIMER_OPT_BOUND', label: 'Opt', group: 'advanced', section: 'Primer fraction bound', row: 'PRIMER_BOUND', kind: 'float', defaultValue: '97', step: 0.1, unit: PERCENT, help: 'Preferred percentage of primer bound at the annealing temperature; only used when the bound weights are non-zero.' },
  { tag: 'PRIMER_MAX_BOUND', label: 'Max', group: 'advanced', section: 'Primer fraction bound', row: 'PRIMER_BOUND', kind: 'float', defaultValue: '110', step: 0.1, unit: PERCENT, help: 'Highest acceptable percentage of primer bound at the annealing temperature.' },

  { tag: 'PRIMER_MIN_THREE_PRIME_DISTANCE', label: 'Min 3′ distance', group: 'advanced', section: 'Positional constraints', kind: 'int', defaultValue: '-1', min: -1, step: 1, unit: BP, conflictsWith: ['PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE', 'PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE', 'PRIMER_INTERNAL_MIN_THREE_PRIME_DISTANCE'], help: 'Sets the left and right min 3′ distances at once. Primer3 rejects it together with a left, right or internal 3′ distance.' },
  { tag: 'PRIMER_MIN_LEFT_THREE_PRIME_DISTANCE', label: 'Min left 3′ distance', group: 'advanced', section: 'Positional constraints', kind: 'int', defaultValue: '-1', min: -1, step: 1, unit: BP, conflictsWith: ['PRIMER_MIN_THREE_PRIME_DISTANCE'], help: 'Minimum spacing between the 3′ ends of left primers in returned pairs: -1 lets a primer repeat, 0 requires distinct primers, n > 0 requires 3′ ends at least n bases apart.' },
  { tag: 'PRIMER_MIN_RIGHT_THREE_PRIME_DISTANCE', label: 'Min right 3′ distance', group: 'advanced', section: 'Positional constraints', kind: 'int', defaultValue: '-1', min: -1, step: 1, unit: BP, conflictsWith: ['PRIMER_MIN_THREE_PRIME_DISTANCE'], help: 'Minimum spacing between the 3′ ends of right primers in returned pairs: -1 lets a primer repeat, 0 requires distinct primers, n > 0 requires 3′ ends at least n bases apart.' },
  { tag: 'PRIMER_INSIDE_PENALTY', label: 'Inside target penalty', group: 'advanced', section: 'Positional constraints', kind: 'float', defaultValue: '-1', step: 0.1, conflictsWith: ['SEQUENCE_START_CODON_POSITION'], help: 'Position penalty per base a primer overlaps the target; the default -1 disallows overlap. Non-default values need at most one target.' },
  { tag: 'PRIMER_OUTSIDE_PENALTY', label: 'Outside target penalty', group: 'advanced', section: 'Positional constraints', kind: 'float', defaultValue: '0', step: 0.1, conflictsWith: ['SEQUENCE_START_CODON_POSITION'], help: 'Position penalty per base between the 3′ end of a primer and the target it flanks. Non-default values need at most one target.' },
  { tag: 'PRIMER_MUST_MATCH_FIVE_PRIME', label: 'Must match 5′ end', group: 'advanced', section: 'Positional constraints', kind: 'sequence', defaultValue: '', help: 'Five-letter IUPAC pattern (ACGT, N, R, Y, W, S, M, K, B, H, D, V) the 5′ end of every primer must match, e.g. SNNNN; empty means no constraint.' },
  { tag: 'PRIMER_MUST_MATCH_THREE_PRIME', label: 'Must match 3′ end', group: 'advanced', section: 'Positional constraints', kind: 'sequence', defaultValue: '', help: 'Five-letter IUPAC pattern (ACGT, N, R, Y, W, S, M, K, B, H, D, V) the 3′ end of every primer must match, e.g. NNNNS; empty means no constraint.' },
  { tag: 'PRIMER_MIN_5_PRIME_OVERLAP_OF_JUNCTION', label: 'Junction overlap 5′', group: 'advanced', section: 'Positional constraints', kind: 'int', defaultValue: '7', min: 0, step: 1, unit: BP, help: 'Bases the left or right primer must extend on the 5′ side of a junction from the Junctions list (for example an exon-exon boundary).' },
  { tag: 'PRIMER_MIN_3_PRIME_OVERLAP_OF_JUNCTION', label: 'Junction overlap 3′', group: 'advanced', section: 'Positional constraints', kind: 'int', defaultValue: '4', min: 0, step: 1, unit: BP, help: 'Bases the left or right primer must extend on the 3′ side of a junction from the Junctions list.' },

  { tag: 'PRIMER_SEQUENCING_LEAD', label: 'Lead', group: 'advanced', section: 'Sequencing', kind: 'int', defaultValue: '50', min: 0, step: 1, unit: BP, help: 'Distance from the 3′ end of a sequencing primer to where the trace becomes readable (pick_sequencing_primers only).' },
  { tag: 'PRIMER_SEQUENCING_SPACING', label: 'Spacing', group: 'advanced', section: 'Sequencing', kind: 'int', defaultValue: '500', min: 0, step: 1, unit: BP, help: 'Distance between the 3′ ends of consecutive sequencing primers on the same strand (pick_sequencing_primers only).' },
  { tag: 'PRIMER_SEQUENCING_INTERVAL', label: 'Interval', group: 'advanced', section: 'Sequencing', kind: 'int', defaultValue: '250', min: 0, step: 1, unit: BP, help: 'Distance between the 3′ end of a sequencing primer and the next primer on the opposite strand (pick_sequencing_primers only).' },
  { tag: 'PRIMER_SEQUENCING_ACCURACY', label: 'Accuracy', group: 'advanced', section: 'Sequencing', kind: 'int', defaultValue: '20', min: 0, step: 1, unit: BP, help: 'Window on each side of the calculated 3′ position within which the best sequencing primer is chosen (pick_sequencing_primers only).' },

  { tag: 'PRIMER_MASK_TEMPLATE', label: 'Mask template', group: 'advanced', section: 'Template masking', kind: 'bool', defaultValue: '0', unsupported: NO_KMER_LISTS, help: 'Mask template regions whose genomic k-mer frequencies predict a high primer failure rate (repetitive sequence).' },
  { tag: 'PRIMER_MASK_FAILURE_RATE', label: 'Failure rate cutoff', group: 'advanced', section: 'Template masking', kind: 'float', defaultValue: '0.1', min: 0, max: 1, step: 0.01, unsupported: NO_KMER_LISTS, help: 'Accepted primer failure rate for template masking; higher values mask fewer bases.' },
  { tag: 'PRIMER_MASK_5P_DIRECTION', label: 'Mask 5′ bases', group: 'advanced', section: 'Template masking', kind: 'int', defaultValue: '1', min: 0, step: 1, unit: BP, unsupported: NO_KMER_LISTS, help: 'Number of bases to mask in the 5′ direction around a high-failure k-mer.' },
  { tag: 'PRIMER_MASK_3P_DIRECTION', label: 'Mask 3′ bases', group: 'advanced', section: 'Template masking', kind: 'int', defaultValue: '0', min: 0, step: 1, unit: BP, unsupported: NO_KMER_LISTS, help: 'Number of bases to mask in the 3′ direction around a high-failure k-mer.' },
  { tag: 'PRIMER_MASK_KMERLIST_PATH', label: 'K-mer list folder', group: 'advanced', section: 'Template masking', kind: 'text', defaultValue: '', unsupported: NO_KMER_LISTS, help: 'Folder containing the k-mer list files used for template masking.' },
  { tag: 'PRIMER_MASK_KMERLIST_PREFIX', label: 'K-mer list species', group: 'advanced', section: 'Template masking', kind: 'text', defaultValue: 'homo_sapiens', unsupported: NO_KMER_LISTS, help: 'Species prefix of the k-mer list files, e.g. homo_sapiens.' },

  { tag: 'PRIMER_LIBERAL_BASE', label: 'Liberal base', group: 'advanced', section: 'Miscellaneous', kind: 'bool', defaultValue: '0', help: 'Accept IUPAC ambiguity codes by converting unrecognised bases to N; raise Max Ns accepted to allow them inside oligos.' },
  { tag: 'PRIMER_LOWERCASE_MASKING', label: 'Lowercase masking', group: 'advanced', section: 'Miscellaneous', kind: 'bool', defaultValue: '0', help: 'Reject primers whose 3′-terminal base is lowercase (e.g. repeat-masked); lowercase bases elsewhere in a primer are allowed.' },
  { tag: 'PRIMER_PICK_ANYWAY', label: 'Pick anyway', group: 'advanced', section: 'Miscellaneous', kind: 'bool', defaultValue: '0', help: 'Return the oligos given under Known oligos even if they violate constraints.' },
  { tag: 'PRIMER_SECONDARY_STRUCTURE_ALIGNMENT', label: 'Show structures', group: 'advanced', section: 'Miscellaneous', kind: 'bool', defaultValue: '0', help: 'Add text drawings of the most stable dimer and hairpin structures to the output (thermodynamic alignment only).' },

  // internal
  { tag: 'PRIMER_INTERNAL_MIN_SIZE', label: 'Min', group: 'internal', section: 'Internal oligo size', row: 'PRIMER_INTERNAL_SIZE', kind: 'int', defaultValue: '18', min: 1, max: MAX_OLIGO_LENGTH, step: 1, unit: BP, help: 'Shortest acceptable internal oligo length.' },
  { tag: 'PRIMER_INTERNAL_OPT_SIZE', label: 'Opt', group: 'internal', section: 'Internal oligo size', row: 'PRIMER_INTERNAL_SIZE', kind: 'int', defaultValue: '20', min: 1, max: MAX_OLIGO_LENGTH, step: 1, unit: BP, help: 'Preferred internal oligo length.' },
  { tag: 'PRIMER_INTERNAL_MAX_SIZE', label: 'Max', group: 'internal', section: 'Internal oligo size', row: 'PRIMER_INTERNAL_SIZE', kind: 'int', defaultValue: '27', min: 1, max: MAX_OLIGO_LENGTH, step: 1, unit: BP, help: 'Longest acceptable internal oligo length; at most 36 bases.' },

  { tag: 'PRIMER_INTERNAL_MIN_TM', label: 'Min', group: 'internal', section: 'Internal oligo Tm', row: 'PRIMER_INTERNAL_TM', kind: 'float', defaultValue: '57', step: 0.1, unit: CELSIUS, help: 'Lowest acceptable internal oligo melting temperature.' },
  { tag: 'PRIMER_INTERNAL_OPT_TM', label: 'Opt', group: 'internal', section: 'Internal oligo Tm', row: 'PRIMER_INTERNAL_TM', kind: 'float', defaultValue: '60', step: 0.1, unit: CELSIUS, help: 'Preferred internal oligo melting temperature.' },
  { tag: 'PRIMER_INTERNAL_MAX_TM', label: 'Max', group: 'internal', section: 'Internal oligo Tm', row: 'PRIMER_INTERNAL_TM', kind: 'float', defaultValue: '63', step: 0.1, unit: CELSIUS, help: 'Highest acceptable internal oligo melting temperature.' },

  { tag: 'PRIMER_INTERNAL_MIN_GC', label: 'Min', group: 'internal', section: 'Internal oligo GC %', row: 'PRIMER_INTERNAL_GC', kind: 'float', defaultValue: '20', min: 0, max: 100, step: 0.1, unit: PERCENT, help: 'Lowest acceptable GC percentage of an internal oligo.' },
  { tag: 'PRIMER_INTERNAL_OPT_GC_PERCENT', label: 'Opt', group: 'internal', section: 'Internal oligo GC %', row: 'PRIMER_INTERNAL_GC', kind: 'float', defaultValue: '', min: 0, max: 100, step: 0.1, unit: PERCENT, help: 'Preferred internal oligo GC percentage; empty means no optimum. Only used when the internal GC % weights are non-zero.' },
  { tag: 'PRIMER_INTERNAL_MAX_GC', label: 'Max', group: 'internal', section: 'Internal oligo GC %', row: 'PRIMER_INTERNAL_GC', kind: 'float', defaultValue: '80', min: 0, max: 100, step: 0.1, unit: PERCENT, help: 'Highest acceptable GC percentage of an internal oligo.' },

  { tag: 'PRIMER_INTERNAL_MIN_BOUND', label: 'Min', group: 'internal', section: 'Internal oligo fraction bound', row: 'PRIMER_INTERNAL_BOUND', kind: 'float', defaultValue: '-10', step: 0.1, unit: PERCENT, help: 'Lowest acceptable percentage of internal oligo bound at the annealing temperature (Advanced tab).' },
  { tag: 'PRIMER_INTERNAL_OPT_BOUND', label: 'Opt', group: 'internal', section: 'Internal oligo fraction bound', row: 'PRIMER_INTERNAL_BOUND', kind: 'float', defaultValue: '97', step: 0.1, unit: PERCENT, help: 'Preferred percentage of internal oligo bound at the annealing temperature; only used when the internal bound weights are non-zero.' },
  { tag: 'PRIMER_INTERNAL_MAX_BOUND', label: 'Max', group: 'internal', section: 'Internal oligo fraction bound', row: 'PRIMER_INTERNAL_BOUND', kind: 'float', defaultValue: '110', step: 0.1, unit: PERCENT, help: 'Highest acceptable percentage of internal oligo bound at the annealing temperature.' },

  { tag: 'PRIMER_INTERNAL_MAX_POLY_X', label: 'Max poly-X', group: 'internal', section: 'Internal oligo composition', kind: 'int', defaultValue: '5', min: 0, step: 1, unit: BP, help: 'Longest allowed mononucleotide run in an internal oligo; Ns count as the worst case.' },
  { tag: 'PRIMER_INTERNAL_MAX_NS_ACCEPTED', label: 'Max Ns accepted', group: 'internal', section: 'Internal oligo composition', kind: 'int', defaultValue: '0', min: 0, step: 1, help: 'Maximum number of unknown bases (N) allowed in an internal oligo.' },

  { tag: 'PRIMER_INTERNAL_MAX_SELF_ANY_TH', label: 'Max self compl. Tm', group: 'internal', section: 'Internal oligo complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Maximum melting temperature of the most stable structure an internal oligo forms with a copy of itself (thermodynamic oligo alignment).' },
  { tag: 'PRIMER_INTERNAL_MAX_SELF_END_TH', label: 'Max 3′ self compl. Tm', group: 'internal', section: 'Internal oligo complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Like Max self compl. Tm, but only for 3′-anchored structures of the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_MAX_HAIRPIN_TH', label: 'Max hairpin Tm', group: 'internal', section: 'Internal oligo complementarity', kind: 'float', defaultValue: '47', step: 0.1, unit: CELSIUS, help: 'Maximum melting temperature of the most stable hairpin an internal oligo forms (thermodynamic oligo alignment).' },
  { tag: 'PRIMER_INTERNAL_MAX_SELF_ANY', label: 'Max self complementarity', group: 'internal', section: 'Internal oligo complementarity', kind: 'float', defaultValue: '12', min: 0, max: 9999.99, step: 0.1, help: 'Maximum local alignment score of an internal oligo against itself. Used when thermodynamic oligo alignment is off.' },
  { tag: 'PRIMER_INTERNAL_MAX_SELF_END', label: 'Max 3′ self compl.', group: 'internal', section: 'Internal oligo complementarity', kind: 'float', defaultValue: '12', min: 0, max: 9999.99, step: 0.1, help: 'Maximum 3′-anchored self alignment score of an internal oligo. Probes do not prime, so keep it at least as high as Max self complementarity.' },

  { tag: 'PRIMER_INTERNAL_MAX_LIBRARY_MISHYB', label: 'Max library mishyb', group: 'internal', section: 'Internal oligo mishybridization', kind: 'float', defaultValue: '12', min: 0, max: 9999.99, step: 0.1, help: 'Maximum weighted alignment score of an internal oligo against any sequence in the mishybridization library.' },

  { tag: 'PRIMER_INTERNAL_SALT_MONOVALENT', label: 'Monovalent cations', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '50', min: 0, step: 0.1, unit: MILLIMOLAR, help: 'Monovalent cation concentration of the hybridization buffer, used for internal oligo Tm.' },
  { tag: 'PRIMER_INTERNAL_SALT_DIVALENT', label: 'Divalent cations', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unit: MILLIMOLAR, help: 'Divalent cation (Mg²⁺) concentration used for internal oligo Tm.' },
  { tag: 'PRIMER_INTERNAL_DNTP_CONC', label: 'dNTP conc', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unit: MILLIMOLAR, help: 'Total dNTP concentration used for internal oligo Tm; only matters when divalent cations are above 0.' },
  { tag: 'PRIMER_INTERNAL_DNA_CONC', label: 'Oligo conc', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '50', min: 0, step: 1, unit: 'nM', help: 'Internal oligo concentration used to estimate its melting temperature.' },
  { tag: 'PRIMER_INTERNAL_DMSO_CONC', label: 'DMSO conc', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unit: PERCENT, help: 'DMSO concentration for the internal oligo; Tm is lowered by DMSO factor × DMSO %.' },
  { tag: 'PRIMER_INTERNAL_DMSO_FACTOR', label: 'DMSO factor', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '0.6', min: 0, step: 0.05, help: 'Internal oligo Tm correction per percent DMSO.' },
  { tag: 'PRIMER_INTERNAL_FORMAMIDE_CONC', label: 'Formamide conc', group: 'internal', section: 'Internal oligo concentrations', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unit: 'mol/l', help: 'Formamide concentration for the internal oligo; Tm is corrected by (0.453 × GC fraction - 2.88) × concentration.' },

  { tag: 'PRIMER_INTERNAL_MIN_THREE_PRIME_DISTANCE', label: 'Min 3′ distance', group: 'internal', section: 'Internal oligo position', kind: 'int', defaultValue: '-1', min: -1, step: 1, unit: BP, conflictsWith: ['PRIMER_MIN_THREE_PRIME_DISTANCE'], help: 'Minimum spacing between the 3′ ends of internal oligos in returned results: -1 allows repeats, 0 requires distinct oligos, n > 0 requires 3′ ends at least n bases apart.' },
  { tag: 'PRIMER_INTERNAL_MUST_MATCH_FIVE_PRIME', label: 'Must match 5′ end', group: 'internal', section: 'Internal oligo position', kind: 'sequence', defaultValue: '', help: 'Five-letter IUPAC pattern the 5′ end of the internal oligo must match, e.g. NNNNN; empty means no constraint.' },
  { tag: 'PRIMER_INTERNAL_MUST_MATCH_THREE_PRIME', label: 'Must match 3′ end', group: 'internal', section: 'Internal oligo position', kind: 'sequence', defaultValue: '', help: 'Five-letter IUPAC pattern the 3′ end of the internal oligo must match; empty means no constraint.' },
  { tag: 'PRIMER_INTERNAL_MIN_5_PRIME_OVERLAP_OF_JUNCTION', label: 'Junction overlap 5′', group: 'internal', section: 'Internal oligo position', kind: 'int', defaultValue: '3', min: 0, step: 1, unit: BP, help: 'Bases the internal oligo must extend on the 5′ side of a junction from the Probe junctions list.' },
  { tag: 'PRIMER_INTERNAL_MIN_3_PRIME_OVERLAP_OF_JUNCTION', label: 'Junction overlap 3′', group: 'internal', section: 'Internal oligo position', kind: 'int', defaultValue: '3', min: 0, step: 1, unit: BP, help: 'Bases the internal oligo must extend on the 3′ side of a junction from the Probe junctions list.' },

  // penalties
  { tag: 'PRIMER_WT_SIZE_LT', label: 'Size lt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_SIZE', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per base a primer is shorter than the optimum size.' },
  { tag: 'PRIMER_WT_SIZE_GT', label: 'Size gt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_SIZE', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per base a primer is longer than the optimum size.' },
  { tag: 'PRIMER_WT_TM_LT', label: 'Tm lt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_TM', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per degree a primer Tm is below the optimum Tm.' },
  { tag: 'PRIMER_WT_TM_GT', label: 'Tm gt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_TM', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per degree a primer Tm is above the optimum Tm.' },
  { tag: 'PRIMER_WT_GC_PERCENT_LT', label: 'GC % lt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_GC', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent a primer GC content is below the optimum GC %.' },
  { tag: 'PRIMER_WT_GC_PERCENT_GT', label: 'GC % gt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_GC', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent a primer GC content is above the optimum GC %.' },
  { tag: 'PRIMER_WT_BOUND_LT', label: 'Bound lt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_BOUND', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent a primer is bound below the optimum fraction bound.' },
  { tag: 'PRIMER_WT_BOUND_GT', label: 'Bound gt', group: 'penalties', section: 'Primer weights', row: 'PRIMER_WT_BOUND', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent a primer is bound above the optimum fraction bound.' },
  { tag: 'PRIMER_WT_SELF_ANY_TH', label: 'Self compl. Tm', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the self-complementarity Tm of a primer (thermodynamic alignment).' },
  { tag: 'PRIMER_WT_SELF_END_TH', label: '3′ self compl. Tm', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ self-complementarity Tm of a primer (thermodynamic alignment).' },
  { tag: 'PRIMER_WT_HAIRPIN_TH', label: 'Hairpin Tm', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the hairpin Tm of a primer (thermodynamic alignment).' },
  { tag: 'PRIMER_WT_SELF_ANY', label: 'Self complementarity', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the self-complementarity alignment score of a primer.' },
  { tag: 'PRIMER_WT_SELF_END', label: '3′ self compl.', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ self-complementarity alignment score of a primer.' },
  { tag: 'PRIMER_WT_END_STABILITY', label: '3′ stability', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ end stability (ΔG of the last five bases) of a primer.' },
  { tag: 'PRIMER_WT_NUM_NS', label: 'Ns', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per unknown base (N) in a primer.' },
  { tag: 'PRIMER_WT_LIBRARY_MISPRIMING', label: 'Library mispriming', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the best match of a primer to any mispriming library sequence.' },
  { tag: 'PRIMER_WT_TEMPLATE_MISPRIMING', label: 'Template mispriming', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for primer binding elsewhere in the template (alignment score). Values from Primer3 1.x must be multiplied by 100.' },
  { tag: 'PRIMER_WT_TEMPLATE_MISPRIMING_TH', label: 'Template mispr. Tm', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for primer binding elsewhere in the template (thermodynamic template alignment).' },
  { tag: 'PRIMER_WT_SEQ_QUAL', label: 'Sequence quality', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for low base quality within a primer; non-zero values require quality scores.' },
  { tag: 'PRIMER_WT_END_QUAL', label: 'End quality', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for low base quality at the primer 3′ end. Accepted by Primer3 2.6.1 but not used in its scoring.' },
  { tag: 'PRIMER_WT_POS_PENALTY', label: 'Position penalty', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Weight of the position penalty computed from the inside and outside target penalties.' },
  { tag: 'PRIMER_WT_MASK_FAILURE_RATE', label: 'Failure rate', group: 'penalties', section: 'Primer weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, unsupported: NO_KMER_LISTS, help: 'Penalty weight for the predicted failure rate of a primer from template masking.' },

  { tag: 'PRIMER_INTERNAL_WT_SIZE_LT', label: 'Size lt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_SIZE', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per base an internal oligo is shorter than its optimum size.' },
  { tag: 'PRIMER_INTERNAL_WT_SIZE_GT', label: 'Size gt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_SIZE', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per base an internal oligo is longer than its optimum size.' },
  { tag: 'PRIMER_INTERNAL_WT_TM_LT', label: 'Tm lt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_TM', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per degree the internal oligo Tm is below its optimum.' },
  { tag: 'PRIMER_INTERNAL_WT_TM_GT', label: 'Tm gt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_TM', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Penalty weight per degree the internal oligo Tm is above its optimum.' },
  { tag: 'PRIMER_INTERNAL_WT_GC_PERCENT_LT', label: 'GC % lt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_GC', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent the internal oligo GC content is below its optimum.' },
  { tag: 'PRIMER_INTERNAL_WT_GC_PERCENT_GT', label: 'GC % gt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_GC', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent the internal oligo GC content is above its optimum.' },
  { tag: 'PRIMER_INTERNAL_WT_BOUND_LT', label: 'Bound lt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_BOUND', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent the internal oligo is bound below its optimum fraction bound.' },
  { tag: 'PRIMER_INTERNAL_WT_BOUND_GT', label: 'Bound gt', group: 'penalties', section: 'Internal oligo weights', row: 'PRIMER_INTERNAL_WT_BOUND', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per percent the internal oligo is bound above its optimum fraction bound.' },
  { tag: 'PRIMER_INTERNAL_WT_SELF_ANY_TH', label: 'Self compl. Tm', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the self-complementarity Tm of the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_WT_SELF_END_TH', label: '3′ self compl. Tm', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ self-complementarity Tm of the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_WT_HAIRPIN_TH', label: 'Hairpin Tm', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the hairpin Tm of the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_WT_SELF_ANY', label: 'Self complementarity', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the self-complementarity alignment score of the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_WT_SELF_END', label: '3′ self compl.', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ self-complementarity alignment score of the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_WT_NUM_NS', label: 'Ns', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per unknown base (N) in the internal oligo.' },
  { tag: 'PRIMER_INTERNAL_WT_LIBRARY_MISHYB', label: 'Library mishyb', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the best match of the internal oligo to any mishybridization library sequence.' },
  { tag: 'PRIMER_INTERNAL_WT_SEQ_QUAL', label: 'Sequence quality', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for low base quality within the internal oligo; non-zero values require quality scores.' },
  { tag: 'PRIMER_INTERNAL_WT_END_QUAL', label: 'End quality', group: 'penalties', section: 'Internal oligo weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for low base quality at the internal oligo end. Accepted by Primer3 2.6.1 but not used in its scoring.' },

  { tag: 'PRIMER_PAIR_WT_PR_PENALTY', label: 'Primer penalty', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '1', min: 0, step: 0.1, help: 'Multiplier for the summed left and right primer penalties in the pair penalty; values below 1 can slow the search substantially.' },
  { tag: 'PRIMER_PAIR_WT_IO_PENALTY', label: 'Internal oligo penalty', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Multiplier for the internal oligo penalty in the pair penalty.' },
  { tag: 'PRIMER_PAIR_WT_DIFF_TM', label: 'Tm difference', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per degree of Tm difference between the left and right primer.' },
  { tag: 'PRIMER_PAIR_WT_COMPL_ANY_TH', label: 'Pair compl. Tm', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the complementarity Tm between the left and right primer (thermodynamic alignment).' },
  { tag: 'PRIMER_PAIR_WT_COMPL_END_TH', label: '3′ pair compl. Tm', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ complementarity Tm between the left and right primer (thermodynamic alignment).' },
  { tag: 'PRIMER_PAIR_WT_COMPL_ANY', label: 'Pair complementarity', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the complementarity alignment score between the left and right primer.' },
  { tag: 'PRIMER_PAIR_WT_COMPL_END', label: '3′ pair compl.', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the 3′ complementarity alignment score between the left and right primer.' },
  { tag: 'PRIMER_PAIR_WT_LIBRARY_MISPRIMING', label: 'Library mispriming', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the summed library mispriming scores of the pair.' },
  { tag: 'PRIMER_PAIR_WT_TEMPLATE_MISPRIMING', label: 'Template mispriming', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the pair binding elsewhere in the template (alignment score). Values from Primer3 1.x must be multiplied by 100.' },
  { tag: 'PRIMER_PAIR_WT_TEMPLATE_MISPRIMING_TH', label: 'Template mispr. Tm', group: 'penalties', section: 'Pair weights', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight for the pair binding elsewhere in the template (thermodynamic template alignment).' },
  { tag: 'PRIMER_PAIR_WT_PRODUCT_SIZE_LT', label: 'Product size lt', group: 'penalties', section: 'Pair weights', row: 'PRIMER_PAIR_WT_PRODUCT_SIZE', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per base the product is shorter than the optimum product size.' },
  { tag: 'PRIMER_PAIR_WT_PRODUCT_SIZE_GT', label: 'Product size gt', group: 'penalties', section: 'Pair weights', row: 'PRIMER_PAIR_WT_PRODUCT_SIZE', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per base the product is longer than the optimum product size.' },
  { tag: 'PRIMER_PAIR_WT_PRODUCT_TM_LT', label: 'Product Tm lt', group: 'penalties', section: 'Pair weights', row: 'PRIMER_PAIR_WT_PRODUCT_TM', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per degree the product Tm is below the optimum product Tm.' },
  { tag: 'PRIMER_PAIR_WT_PRODUCT_TM_GT', label: 'Product Tm gt', group: 'penalties', section: 'Pair weights', row: 'PRIMER_PAIR_WT_PRODUCT_TM', kind: 'float', defaultValue: '0', min: 0, step: 0.1, help: 'Penalty weight per degree the product Tm is above the optimum product Tm.' },

  // sequence
  { tag: 'SEQUENCE_TARGET', label: 'Targets', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'Regions every pair must flank, as space-separated start,length pairs in 1-based record positions, e.g. "120,30 400,10". With pick_sequencing_primers these are the regions to sequence.' },
  { tag: 'SEQUENCE_EXCLUDED_REGION', label: 'Excluded regions', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'Regions left and right primers must not overlap, as space-separated start,length pairs in 1-based record positions.' },
  { tag: 'SEQUENCE_INCLUDED_REGION', label: 'Included region', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'The single region in which to pick oligos, as start,length in 1-based record positions. Ignored when the selection itself is used as the included region.' },
  { tag: 'SEQUENCE_INTERNAL_EXCLUDED_REGION', label: 'Probe excluded regions', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'Regions the internal oligo must not overlap (primers may), as space-separated start,length pairs in 1-based record positions.' },
  { tag: 'SEQUENCE_PRIMER_PAIR_OK_REGION_LIST', label: 'Pair OK regions', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'Allowed left/right primer locations as semicolon-separated leftStart,leftLength,rightStart,rightLength in 1-based record positions; leave a half empty for no constraint, e.g. "100,50,300,50 ; 900,60,,".' },
  { tag: 'SEQUENCE_OVERLAP_JUNCTION_LIST', label: 'Junctions', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'Space-separated 1-based record positions; the left or right primer must span the junction just after one of them (overlap set in Advanced).' },
  { tag: 'SEQUENCE_INTERNAL_OVERLAP_JUNCTION_LIST', label: 'Probe junctions', group: 'sequence', section: 'Targets & regions', kind: 'coordinates', defaultValue: '', help: 'Space-separated 1-based record positions; the internal oligo must span the junction just after one of them (overlap set in Internal oligo).' },

  { tag: 'SEQUENCE_FORCE_LEFT_START', label: 'Left 5′ end', group: 'sequence', section: 'Forced positions', kind: 'coordinates', defaultValue: '', help: 'Force the 5′ end of the left primer to this 1-based record position; primers are returned even if they violate some constraints.' },
  { tag: 'SEQUENCE_FORCE_LEFT_END', label: 'Left 3′ end', group: 'sequence', section: 'Forced positions', kind: 'coordinates', defaultValue: '', help: 'Force the 3′ end of the left primer to this 1-based record position; primers are returned even if they violate some constraints.' },
  { tag: 'SEQUENCE_FORCE_RIGHT_START', label: 'Right 5′ end', group: 'sequence', section: 'Forced positions', kind: 'coordinates', defaultValue: '', help: 'Force the 5′ end of the right primer to this 1-based record position; primers are returned even if they violate some constraints.' },
  { tag: 'SEQUENCE_FORCE_RIGHT_END', label: 'Right 3′ end', group: 'sequence', section: 'Forced positions', kind: 'coordinates', defaultValue: '', help: 'Force the 3′ end of the right primer to this 1-based record position; primers are returned even if they violate some constraints.' },
  { tag: 'SEQUENCE_START_CODON_POSITION', label: 'Start codon position', group: 'sequence', section: 'Forced positions', kind: 'coordinates', defaultValue: '', conflictsWith: ['PRIMER_INSIDE_PENALTY', 'PRIMER_OUTSIDE_PENALTY'], help: 'Experimental: 1-based record position of the first base of a start codon, so Primer3 picks in-frame amplicons. Cannot be combined with non-default inside/outside target penalties.' },
  { tag: 'SEQUENCE_START_CODON_SEQUENCE', label: 'Start codon', group: 'sequence', section: 'Forced positions', kind: 'sequence', defaultValue: 'ATG', help: 'Codon expected at the start codon position; ATG by default, but any triplet is accepted.' },

  { tag: 'SEQUENCE_PRIMER', label: 'Left primer', group: 'sequence', section: 'Known oligos', kind: 'sequence', defaultValue: '', help: 'Left primer (5′→3′) to check or design around; it must occur in the template.' },
  { tag: 'SEQUENCE_INTERNAL_OLIGO', label: 'Internal oligo', group: 'sequence', section: 'Known oligos', kind: 'sequence', defaultValue: '', help: 'Internal oligo (5′→3′) to check or design around; it must occur in the template.' },
  { tag: 'SEQUENCE_PRIMER_REVCOMP', label: 'Right primer', group: 'sequence', section: 'Known oligos', kind: 'sequence', defaultValue: '', help: 'Right primer (5′→3′) to check or design around; it must occur on the reverse strand of the template.' },
  { tag: 'SEQUENCE_OVERHANG_LEFT', label: 'Left 5′ overhang', group: 'sequence', section: 'Known oligos', kind: 'sequence', defaultValue: '', help: 'Sequence added to the 5′ end of the left primer, e.g. a restriction site. Included in dimer and hairpin checks but not in Tm, GC % or the product size range.' },
  { tag: 'SEQUENCE_OVERHANG_RIGHT', label: 'Right 5′ overhang', group: 'sequence', section: 'Known oligos', kind: 'sequence', defaultValue: '', help: 'Sequence added to the 5′ end of the right primer. Included in dimer and hairpin checks but not in Tm, GC % or the product size range.' },

  // quality
  { tag: 'SEQUENCE_QUALITY', label: 'Quality scores', group: 'quality', section: 'Sequence quality', kind: 'text', defaultValue: '', help: 'Space-separated base quality scores (e.g. phred), exactly one per base of the whole record in record order; higher means more confident.' },
  { tag: 'PRIMER_MIN_QUALITY', label: 'Min quality', group: 'quality', section: 'Sequence quality', kind: 'int', defaultValue: '0', min: 0, step: 1, help: 'Lowest base quality allowed anywhere in a primer; only applies when quality scores are given.' },
  { tag: 'PRIMER_MIN_END_QUALITY', label: 'Min 3′ end quality', group: 'quality', section: 'Sequence quality', kind: 'int', defaultValue: '0', min: 0, step: 1, help: 'Lowest base quality allowed in the last five 3′ bases of a left or right primer; only applies when quality scores are given.' },
  { tag: 'PRIMER_INTERNAL_MIN_QUALITY', label: 'Min internal quality', group: 'quality', section: 'Sequence quality', kind: 'int', defaultValue: '0', min: 0, step: 1, help: 'Lowest base quality allowed anywhere in the internal oligo; only applies when quality scores are given.' },

  { tag: 'PRIMER_QUALITY_RANGE_MIN', label: 'Min', group: 'quality', section: 'Quality range', row: 'PRIMER_QUALITY_RANGE', kind: 'int', defaultValue: '0', step: 1, help: 'Lowest legal quality score; every quality score and min quality setting must lie within the range.' },
  { tag: 'PRIMER_QUALITY_RANGE_MAX', label: 'Max', group: 'quality', section: 'Quality range', row: 'PRIMER_QUALITY_RANGE', kind: 'int', defaultValue: '100', step: 1, help: 'Highest legal quality score; every quality score and min quality setting must lie within the range.' },
]

export function primer3DefaultSettings(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const def of PRIMER3_SETTINGS) {
    out[def.tag] = def.defaultValue
  }
  return out
}

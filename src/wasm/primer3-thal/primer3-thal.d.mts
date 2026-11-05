export type Primer3ThalModule = {
  _primer3_thal_align(
    seq1: number, seq2: number, mode: number,
    mvMmol: number, dvMmol: number, dntpMmol: number,
    dnaNmol: number, structureTempC: number, maxLoop: number,
  ): number
  _primer3_thal_free(pointer: number): void
  _malloc(size: number): number
  _free(pointer: number): void
  stringToUTF8(value: string, pointer: number, maxBytes: number): void
  lengthBytesUTF8(value: string): number
  UTF8ToString(pointer: number): string
}
export type Primer3ThalModuleFactory = () => Promise<Primer3ThalModule>
declare const createPrimer3ThalModule: Primer3ThalModuleFactory
export default createPrimer3ThalModule

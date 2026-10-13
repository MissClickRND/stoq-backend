export interface UnitResponseDto {
  id: number;
  name: string;
  shortName: string;
}

export function mapUnitToDto(unit: any): UnitResponseDto {
  return {
    id: unit.id,
    name: unit.name,
    shortName: unit.shortName,
  };
}

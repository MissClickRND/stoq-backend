export interface ProductResponseDto {
  id: number;
  name: string;
  unit: {
    id: number;
    name: string;
    shortName: string;
  };
}

export function mapProductToDto(product: any): ProductResponseDto {
  return {
    id: product.id,
    name: product.name,
    unit: {
      id: product.unit.id,
      name: product.unit.name,
      shortName: product.unit.shortName,
    },
  };
}
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';

export type DependencyStatus = 'available' | 'low_stock' | 'unavailable';
export type IngredientStatus = 'available' | 'low_stock' | 'out_of_stock';

export class IngredientGraphDataDto {
  @ApiProperty() name!: string;
  @ApiProperty({
    minimum: 0,
    description: 'Пригодный доступный остаток в единице продукта',
  })
  quantity!: number;
  @ApiProperty({ example: 'кг' }) unit!: string;
  @ApiProperty({ enum: ['available', 'low_stock', 'out_of_stock'] })
  status!: IngredientStatus;
}
export class IngredientGraphNodeDto {
  @ApiProperty({ example: 'product:1' }) id!: string;
  @ApiProperty({ enum: ['ingredient'] }) type!: 'ingredient';
  @ApiProperty({ type: IngredientGraphDataDto }) data!: IngredientGraphDataDto;
}
export class DishGraphDataDto {
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['available', 'low_stock', 'unavailable'] })
  status!: DependencyStatus;
}
export class DishGraphNodeDto {
  @ApiProperty({ example: 'dish:11' }) id!: string;
  @ApiProperty({ enum: ['dish'] }) type!: 'dish';
  @ApiProperty({ type: DishGraphDataDto }) data!: DishGraphDataDto;
}
export class RecipeGraphDataDto {
  @ApiProperty({
    exclusiveMinimum: true,
    minimum: 0,
    description: 'Расход на одну порцию',
  })
  required!: number;
  @ApiProperty({ example: 'кг' }) unit!: string;
  @ApiProperty({ enum: ['available', 'low_stock', 'unavailable'] })
  status!: DependencyStatus;
}
export class RecipeGraphEdgeDto {
  @ApiProperty({ example: 'recipe:1' }) id!: string;
  @ApiProperty({ example: 'product:1' }) source!: string;
  @ApiProperty({ example: 'dish:11' }) target!: string;
  @ApiProperty({ type: RecipeGraphDataDto }) data!: RecipeGraphDataDto;
}
export class DependencyGraphResponseDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(IngredientGraphNodeDto) },
        { $ref: getSchemaPath(DishGraphNodeDto) },
      ],
    },
  })
  nodes!: (IngredientGraphNodeDto | DishGraphNodeDto)[];
  @ApiProperty({ type: [RecipeGraphEdgeDto] }) edges!: RecipeGraphEdgeDto[];
}

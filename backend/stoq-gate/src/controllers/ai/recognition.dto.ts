import { ApiProperty } from '@nestjs/swagger';

export class AiProductDto {
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: Number, nullable: true }) quantity!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) price!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) totalPrice!: number | null;
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
}
export class AiRecognitionDto {
  @ApiProperty({ type: String, nullable: true, example: 'ООО Молочный двор' }) sellerName!: string | null;
  @ApiProperty({ type: AiProductDto, isArray: true }) items!: AiProductDto[];
}

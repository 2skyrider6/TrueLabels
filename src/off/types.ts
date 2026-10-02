export interface OffProduct {
  code: string;
  product_name?: string;
  brands?: string;
  ingredients_text?: string;
  allergens_text?: string;
  ingredients_analysis_tags?: string[];
  image_front_url?: string;
  [key: string]: unknown;
}

export interface OffApiResponse {
  status: number;
  status_verbose: string;
  product?: OffProduct;
  code?: string;
}
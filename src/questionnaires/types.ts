export type AlbumType = "single" | "couple" | "memorial";

export type FieldType = "text" | "textarea" | "select" | "date";

export interface SelectOption {
  label: string;
  value: string;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: SelectOption[];
  /** Force LTR direction (for phone, email, date fields) */
  dir?: "ltr";
  maxLength?: number;
}

export interface StepConfig {
  key: string;
  label: string;
  fields: FieldConfig[];
}

export interface QuestionnaireConfig {
  albumType: AlbumType;
  steps: StepConfig[];
}

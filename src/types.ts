export type User = {
  id: string;
  username: string;
  age: number;
  hobbies: string[];
};

export type ApiResponse = {
  status: number;
  body?: unknown;
  headers?: Record<string,string>;
};

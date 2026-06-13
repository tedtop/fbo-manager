export type Product = {
  id: string
  name: string
  price: number
  type: "fuel" | "service" | "fee" | "product"
  description?: string
}

export type CartItem = Product & {
  quantity: number
}

export type Customer = {
  id: string
  name: string
  type: string
}

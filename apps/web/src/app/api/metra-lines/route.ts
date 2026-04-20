import { NextResponse } from "next/server";
import shapes from "./shapes.json";

export async function GET() {
  return NextResponse.json(shapes);
}

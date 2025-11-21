import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient, SPACES_BUCKET, CDN_URL } from "@/lib/storage/spaces-client";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const bucket = formData.get("bucket") as string;
    const datasetId = formData.get("datasetId") as string | null;

    if (!file || !bucket) {
      return NextResponse.json(
        { error: "Missing file or bucket parameter" },
        { status: 400 }
      );
    }

    // Generate file path
    const fileExt = file.name.split(".").pop();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);

    const filePath = datasetId
      ? `${datasetId}/${user.id}/${timestamp}_${randomId}.${fileExt}`
      : `${user.id}/${timestamp}_${randomId}.${fileExt}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to DigitalOcean Spaces
    const command = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: `${bucket}/${filePath}`,
      Body: buffer,
      ContentType: file.type,
      ACL: "public-read",
      CacheControl: "max-age=3600",
    });

    await spacesClient.send(command);

    // Generate CDN URL
    const url = `${CDN_URL}/${bucket}/${filePath}`;

    return NextResponse.json({ url, path: filePath, error: null });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse request body
    const { bucket, path } = await request.json();

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Missing bucket or path parameter" },
        { status: 400 }
      );
    }

    // Delete from DigitalOcean Spaces
    const command = new DeleteObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: `${bucket}/${path}`,
    });

    await spacesClient.send(command);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}

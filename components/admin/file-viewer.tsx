"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Eye, 
  Download, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  FileText, 
  File,
  ExternalLink
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/use-translations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FileViewerProps {
  fileUrls: string[];
  metadata?: {
    fileCount?: number;
    totalSize?: number;
  };
}

export function FileViewer({ fileUrls, metadata }: FileViewerProps) {
  const t = useTranslations();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const getFileIcon = (url: string) => {
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) {
      return FileImage;
    } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension || '')) {
      return FileVideo;
    } else if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(extension || '')) {
      return FileAudio;
    } else if (['txt', 'md', 'json', 'csv', 'xml'].includes(extension || '')) {
      return FileText;
    } else {
      return File;
    }
  };

  const getFileType = (url: string) => {
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) {
      return 'Image';
    } else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(extension || '')) {
      return 'Video';
    } else if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(extension || '')) {
      return 'Audio';
    } else if (['txt', 'md', 'json', 'csv', 'xml'].includes(extension || '')) {
      return 'Text';
    } else {
      return 'File';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileName = (url: string) => {
    const parts = url.split('/');
    return parts[parts.length - 1];
  };

  const handlePreview = (url: string) => {
    setSelectedFile(url);
    setPreviewOpen(true);
  };

  const handleDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = getFileName(url);
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderPreview = () => {
    if (!selectedFile) return null;

    const fileType = getFileType(selectedFile);
    const fileName = getFileName(selectedFile);

    return (
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t("Preview:")} {fileName}
            </DialogTitle>
            <DialogDescription>
              {fileType} {t("file preview")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            {fileType === 'Image' && (
              <div className="flex justify-center">
                <Image 
                  src={selectedFile} 
                  alt={fileName}
                  width={800}
                  height={600}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg border"
                  unoptimized
                />
              </div>
            )}
            
            {fileType === 'Video' && (
              <div className="flex justify-center">
                <video 
                  src={selectedFile} 
                  controls 
                  className="max-w-full max-h-[60vh] rounded-lg border"
                >
                  {t("Your browser does not support the video tag.")}
                </video>
              </div>
            )}
            
            {fileType === 'Audio' && (
              <div className="flex justify-center">
                <audio 
                  src={selectedFile} 
                  controls 
                  className="w-full max-w-md"
                >
                  {t("Your browser does not support the audio tag.")}
                </audio>
              </div>
            )}
            
            {(fileType === 'Text' || fileType === 'File') && (
              <div className="text-center py-8">
                <File className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {t("Preview not available for this file type")}
                </p>
                <Button onClick={() => handleDownload(selectedFile)}>
                  <Download className="mr-2 h-4 w-4" />
                  {t("Download to view")}
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center pt-4 border-t">
            <Button variant="outline" onClick={() => handleDownload(selectedFile)}>
              <Download className="mr-2 h-4 w-4" />
              {t("Download")}
            </Button>
            <Button variant="outline" onClick={() => window.open(selectedFile, '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("Open in new tab")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  if (!fileUrls || fileUrls.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <File className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">{t("No files submitted")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <File className="h-5 w-5" />
            {t("Submitted Files")}
            <Badge variant="secondary">
              {fileUrls.length} file{fileUrls.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          {metadata?.totalSize && (
            <p className="text-sm text-muted-foreground">
              {t("Total size:")} {formatFileSize(metadata.totalSize)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {fileUrls.map((url, index) => {
              const Icon = getFileIcon(url);
              const fileType = getFileType(url);
              const fileName = getFileName(url);
              
              return (
                <div 
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{fileName}</p>
                      <p className="text-xs text-muted-foreground">{fileType}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreview(url)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      {t("Preview")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(url)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      {t("Download")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      {renderPreview()}
    </>
  );
}

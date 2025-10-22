import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

// This script should be run from the command line with:
// npx tsx scripts/seed-database.ts

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing Supabase credentials. Make sure to set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local file"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sampleUsers = [
  {
    email: "alex.johnson@example.com",
    full_name: "Alex Johnson",
    role: "requester" as const,
  },
  {
    email: "sarah.chen@example.com",
    full_name: "Sarah Chen",
    role: "requester" as const,
  },
  {
    email: "michael.patel@example.com",
    full_name: "Michael Patel",
    role: "requester" as const,
  },
  {
    email: "emma.wilson@example.com",
    full_name: "Emma Wilson",
    role: "contributor" as const,
  },
  {
    email: "david.martinez@example.com",
    full_name: "David Martinez",
    role: "requester" as const,
  },
];

const datasetRequests = [
  {
    title: "Street Scene Images for Autonomous Driving",
    description:
      "We need diverse street scene images captured in various weather conditions and times of day to train our autonomous vehicle perception system. Images should include pedestrians, vehicles, traffic signs, and road markings.",
    category: "computer-vision",
    data_type: "image",
    samples_needed: 50000,
    reward_amount: 2.5,
    deadline_days: 90,
    quality_criteria: [
      "Minimum resolution: 1920x1080",
      "Clear, well-lit conditions",
      "No watermarks or overlays",
      "Original content only",
    ],
    requirements: [
      "Smartphone with 12MP+ camera",
      "GPS enabled for location tagging",
      "Diverse urban and suburban environments",
    ],
    featured: true,
    imageUrl:
      "https://images.unsplash.com/photo-1526498460520-4c246339dccb?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Customer Service Chat Sentiment Analysis",
    description:
      "Help us build a sentiment analysis model by labeling customer service conversations. Each conversation needs to be categorized by emotional tone and urgency level to improve our support AI.",
    category: "natural-language",
    data_type: "text",
    samples_needed: 10000,
    reward_amount: 0.75,
    deadline_days: 60,
    quality_criteria: [
      "Clear sentiment labels (Positive, Negative, Neutral)",
      "Urgency rating (Low, Medium, High, Critical)",
      "Accurate categorization",
      "Quality control checks required",
    ],
    requirements: [
      "Native or fluent English speaker",
      "Experience with customer service preferred",
      "Pass initial training module",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1525182008055-f88b95ff7980?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Medical Symptom Voice Recordings",
    description:
      "Record yourself describing various medical symptoms to help train our voice-based symptom checker AI. We need diverse accents and speaking styles to ensure accessibility for all users.",
    category: "speech-audio",
    data_type: "audio",
    samples_needed: 5000,
    reward_amount: 3.0,
    deadline_days: 30,
    quality_criteria: [
      "Clear audio, minimal background noise",
      "Natural speaking pace",
      "Audio format: WAV or MP3",
      "Minimum 30 seconds per recording",
    ],
    requirements: [
      "Quiet recording environment",
      "Quality microphone or smartphone",
      "Read from provided symptom scripts",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Facial Expression Recognition Dataset",
    description:
      "We're developing emotion recognition technology for mental health applications. We need video recordings of people expressing various emotions in natural settings with proper consent and privacy protections.",
    category: "computer-vision",
    data_type: "video",
    samples_needed: 15000,
    reward_amount: 5.0,
    deadline_days: 180,
    quality_criteria: [
      "720p minimum resolution",
      "Good lighting conditions",
      "Multiple angles captured",
      "Signed consent form required",
    ],
    requirements: [
      "Age 18+",
      "Comfortable expressing emotions on camera",
      "Privacy agreement signed",
      "Webcam or smartphone with front camera",
    ],
    featured: true,
    imageUrl:
      "https://images.unsplash.com/photo-1518895949257-7621c3c786d4?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Product Review Translation (English to Spanish)",
    description:
      "Translate product reviews from English to Spanish while maintaining the emotional tone and intent. We need native Spanish speakers to ensure cultural nuances are preserved.",
    category: "natural-language",
    data_type: "text",
    samples_needed: 8000,
    reward_amount: 1.5,
    deadline_days: 75,
    quality_criteria: [
      "Native Spanish speaker",
      "Preserve original sentiment",
      "Natural, conversational tone",
      "Grammar and spelling accuracy",
    ],
    requirements: [
      "Fluent in English and Spanish",
      "Understanding of e-commerce terminology",
      "Pass translation quality test",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "X-Ray Image Annotation for Fracture Detection",
    description:
      "Medical professionals needed to annotate X-ray images, identifying and marking bone fractures. This dataset will train AI to assist radiologists in faster diagnosis.",
    category: "healthcare",
    data_type: "image",
    samples_needed: 3000,
    reward_amount: 8.0,
    deadline_days: 150,
    quality_criteria: [
      "Medical professional certification required",
      "Precise fracture boundary marking",
      "Classification by fracture type",
      "Quality peer review",
    ],
    requirements: [
      "Licensed radiologist or orthopedic specialist",
      "Minimum 2 years experience",
      "HIPAA training completed",
      "NDA signed",
    ],
    featured: true,
    imageUrl:
      "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Music Genre Classification Audio Samples",
    description:
      "Record or submit original music clips across various genres to help train our music recommendation AI. We need diverse musical styles from different cultures and eras.",
    category: "speech-audio",
    data_type: "audio",
    samples_needed: 20000,
    reward_amount: 1.25,
    deadline_days: 120,
    quality_criteria: [
      "High-quality audio (320kbps minimum)",
      "30-second clips minimum",
      "Original or properly licensed music",
      "Accurate genre labeling",
    ],
    requirements: [
      "Rights to music submitted",
      "Clear genre knowledge",
      "No copyrighted material without permission",
    ],
    featured: false,
  },
  {
    title: "Robot Navigation Sensor Data Collection",
    description:
      "Help us collect sensor data for indoor robot navigation by walking predefined paths with our mobile app. Data includes accelerometer, gyroscope, and camera feeds.",
    category: "robotics",
    data_type: "mixed",
    samples_needed: 2000,
    reward_amount: 6.0,
    deadline_days: 45,
    quality_criteria: [
      "Complete path traversal",
      "Stable sensor readings",
      "Good lighting for camera",
      "Follow app instructions precisely",
    ],
    requirements: [
      "Modern smartphone (2020 or newer)",
      "Access to indoor spaces",
      "Install our data collection app",
      "Minimum 30-minute sessions",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Podcast Transcription and Speaker Diarization",
    description:
      "Transcribe podcast episodes and identify different speakers. We need accurate transcriptions with speaker labels and timestamps to improve our audio search technology.",
    category: "speech-audio",
    data_type: "audio",
    samples_needed: 1000,
    reward_amount: 12.0,
    deadline_days: 90,
    quality_criteria: [
      "95%+ accuracy in transcription",
      "Speaker identification with labels",
      "Accurate timestamps",
      "Punctuation and formatting",
    ],
    requirements: [
      "Excellent listening skills",
      "Fast typing ability",
      "Attention to detail",
      "Pass transcription test",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Hand Gesture Recognition Video Dataset",
    description:
      "Record yourself performing common hand gestures (thumbs up, peace sign, etc.) to train gesture recognition for smart home control and accessibility features.",
    category: "computer-vision",
    data_type: "video",
    samples_needed: 10000,
    reward_amount: 2.0,
    deadline_days: 60,
    quality_criteria: [
      "Clear view of hand in frame",
      "720p minimum resolution",
      "Various lighting conditions",
      "Different backgrounds",
    ],
    requirements: [
      "Smartphone or webcam",
      "Follow gesture guidelines",
      "3-5 seconds per gesture",
      "Multiple angles per gesture",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Legal Document Classification",
    description:
      "Categorize legal documents by type (contracts, briefs, motions, etc.) and subject matter. This will help law firms organize and search their document repositories more efficiently.",
    category: "natural-language",
    data_type: "text",
    samples_needed: 5000,
    reward_amount: 4.0,
    deadline_days: 100,
    quality_criteria: [
      "Accurate document type classification",
      "Subject matter tagging",
      "Jurisdiction identification",
      "Quality consistency checks",
    ],
    requirements: [
      "Legal background preferred",
      "Understanding of document types",
      "Pass classification training",
      "NDA required",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1528747045269-390fe33c19d4?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Retail Product Image Segmentation",
    description:
      "Help us create a dataset for product image segmentation by precisely outlining products in retail images. This will power our visual search and recommendation engine.",
    category: "computer-vision",
    data_type: "image",
    samples_needed: 25000,
    reward_amount: 1.75,
    deadline_days: 90,
    quality_criteria: [
      "Pixel-perfect segmentation masks",
      "Multiple products per image",
      "Proper layer separation",
      "High zoom accuracy",
    ],
    requirements: [
      "Experience with image annotation tools",
      "Attention to detail",
      "Computer with large display preferred",
      "Pass quality check quiz",
    ],
    featured: true,
    imageUrl:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Conversational AI Dialog Rating",
    description:
      "Rate AI-generated conversations for naturalness, coherence, and helpfulness. Your feedback will improve our chatbot's conversational abilities.",
    category: "natural-language",
    data_type: "text",
    samples_needed: 15000,
    reward_amount: 0.5,
    deadline_days: 45,
    quality_criteria: [
      "Consistent rating criteria",
      "Detailed feedback comments",
      "Understanding of conversational flow",
      "Native English proficiency",
    ],
    requirements: [
      "Experience with chatbots or virtual assistants",
      "Strong communication skills",
      "Complete training session",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1526374932251-137c8a87a526?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Wildlife Camera Trap Image Classification",
    description:
      "Identify and label animals in camera trap images from wildlife reserves. This helps conservation efforts by automating wildlife monitoring.",
    category: "computer-vision",
    data_type: "image",
    samples_needed: 40000,
    reward_amount: 0.65,
    deadline_days: 120,
    quality_criteria: [
      "Accurate species identification",
      "Count number of individuals",
      "Note behavior when visible",
      "Flag empty/false trigger images",
    ],
    requirements: [
      "Basic wildlife knowledge",
      "Complete species recognition training",
      "Access to reference guides provided",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Parking Space Occupancy Detection",
    description:
      "Label parking lot images to indicate which spaces are occupied or vacant. This data will train smart parking systems for cities and shopping centers.",
    category: "computer-vision",
    data_type: "image",
    samples_needed: 30000,
    reward_amount: 0.4,
    deadline_days: 60,
    quality_criteria: [
      "Mark each parking space",
      "Occupied/vacant/unclear labels",
      "Handle partial occupancy",
      "Various weather conditions",
    ],
    requirements: [
      "Smartphone or computer",
      "Basic understanding of parking layouts",
      "Quick labeling turnaround",
    ],
    featured: false,
    imageUrl:
      "https://images.unsplash.com/photo-1518316175104-4e0b0f87dec1?auto=format&fit=crop&w=900&q=80",
  },
];

async function seedDatabase() {
  console.log("🌱 Starting database seeding...");

  try {
    // Create sample users
    console.log("👥 Creating sample users...");
    const createdUserIds: string[] = [];

    for (const user of sampleUsers) {
      // Create auth user
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: user.email,
          email_confirm: true,
          user_metadata: {
            full_name: user.full_name,
          },
        });

      if (authError) {
        console.error(`Error creating user ${user.email}:`, authError.message);
        continue;
      }

      if (authData.user) {
        createdUserIds.push(authData.user.id);

        // Update profile
        await supabase
          .from("profiles")
          .update({ role: user.role })
          .eq("id", authData.user.id);

        console.log(`✅ Created user: ${user.full_name} (${user.email})`);
      }
    }

    // Create dataset requests
    console.log("\n📊 Creating dataset requests...");
    const createdRequests = [];

    for (let i = 0; i < datasetRequests.length; i++) {
      const request = datasetRequests[i];
      const userId = createdUserIds[i % createdUserIds.length];

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + request.deadline_days);

      const { data, error } = await supabase
        .from("dataset_requests")
        .insert({
          created_by: userId,
          title: request.title,
          description: request.description,
          category: request.category,
          data_type: request.data_type,
          samples_needed: request.samples_needed,
          samples_collected: Math.floor(
            Math.random() * request.samples_needed * 0.7
          ),
          reward_amount: request.reward_amount,
          currency: "USD",
          deadline: deadline.toISOString().split("T")[0],
          quality_criteria: request.quality_criteria,
          requirements: request.requirements,
          featured: request.featured,
          image_url: request.imageUrl,
        })
        .select()
        .single();

      if (error) {
        console.error(
          `Error creating request "${request.title}":`,
          error.message
        );
        continue;
      }

      createdRequests.push(data);
      console.log(`✅ Created request: ${request.title}`);
    }

    // Create sample submissions
    console.log("\n📤 Creating sample submissions...");
    let submissionsCreated = 0;

    for (const request of createdRequests) {
      const numSubmissions = Math.floor(Math.random() * 20) + 5;

      for (let i = 0; i < numSubmissions; i++) {
        const contributorId =
          createdUserIds[Math.floor(Math.random() * createdUserIds.length)];
        const statuses = ["pending", "approved", "rejected"] as const;
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        const { error } = await supabase.from("submissions").insert({
          dataset_request_id: request.id,
          contributor_id: contributorId,
          file_urls: [
            `https://example.com/files/${Math.random().toString(36)}.jpg`,
          ],
          metadata: { timestamp: new Date().toISOString() },
          status,
          notes: status === "rejected" ? "Quality standards not met" : null,
        });

        if (!error) {
          submissionsCreated++;
        }
      }
    }

    console.log(`✅ Created ${submissionsCreated} submissions`);

    console.log("\n✨ Database seeding completed successfully!");
    console.log("\n📈 Summary:");
    console.log(`   - Users created: ${createdUserIds.length}`);
    console.log(`   - Dataset requests created: ${createdRequests.length}`);
    console.log(`   - Submissions created: ${submissionsCreated}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

seedDatabase();

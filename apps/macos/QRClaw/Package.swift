// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "QRClaw",
    platforms: [.macOS("14.0")],
    products: [
        .executable(name: "QRClaw", targets: ["QRClaw"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "QRClaw",
            dependencies: [
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: ".",
            exclude: ["Resources"],
            sources: [
                "App",
                "Models",
                "Services",
                "Support",
                "Views",
            ]
        ),
    ]
)
